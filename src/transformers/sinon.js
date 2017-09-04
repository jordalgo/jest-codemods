import { getRequireOrImportName, removeRequireAndImport } from '../utils/imports';
//import logger from '../utils/logger';
import finale from '../utils/finale';

const SINON = 'sinon';

const autoMockedDependencies = [];

export default function expectJsTransfomer(fileInfo, api, options) {
    const j = api.jscodeshift;
    const ast = j(fileInfo.source);
    const sinonImport = getRequireOrImportName(j, ast, SINON);
    //const logWarning = (msg, node) => logger(fileInfo, msg, node);

    if (!sinonImport) {
        // No sinon require/import were found
        return fileInfo.source;
    }

    removeRequireAndImport(j, ast, SINON);
    autoMockDepedencies(j, ast);
    transformStubReturns(j, ast);
    transformCallCountAssertions(j, ast);
    transformCalledWithAssertions(j, ast);
    transformSpyCreation(j, ast);
    transformGetCallMethos(j, ast);

    return finale(fileInfo, j, ast, options, sinonImport);
}

function transformGetCallMethos(j, ast) {
    const getCallMethods = {
        firstCall: 'firstCall',
        secondCall: 'secondCall',
        thirdCall: 'thirdCall',
        lastCall: 'lastCall',
    };
    const methods = Object.keys(getCallMethods);
    const MOCK_CALLS = 'mock.calls';
    const createJestGetCall = (obj, callArg) => {
        return j.memberExpression(
            j.memberExpression(obj, j.identifier(MOCK_CALLS)),
            callArg,
            true
        );
    };

    ast
        .find(j.MemberExpression, {
            property: {
                name: name => methods.includes(name),
            },
        })
        .replaceWith(path => {
            const obj = path.value.object;
            switch (path.value.property.name) {
                case getCallMethods.firstCall:
                    return createJestGetCall(obj, j.literal(0));
                case getCallMethods.secondCall:
                    return createJestGetCall(obj, j.literal(1));
                case getCallMethods.thirdCall:
                    return createJestGetCall(obj, j.literal(2));
                default:
                    return createJestGetCall(
                        obj,
                        j.binaryExpression(
                            '-',
                            j.memberExpression(
                                j.memberExpression(obj, j.identifier(MOCK_CALLS)),
                                j.identifier('length')
                            ),
                            j.literal(1)
                        )
                    );
            }
        });

    ast
        .find(j.CallExpression, {
            callee: {
                property: {
                    name: 'getCalls',
                },
            },
        })
        .replaceWith(path => {
            return j.memberExpression(path.value.callee.object, j.identifier(MOCK_CALLS));
        });

    ast
        .find(j.CallExpression, {
            callee: {
                property: {
                    name: 'getCall',
                },
            },
        })
        .replaceWith(path => {
            return createJestGetCall(path.value.callee.object, path.value.arguments[0]);
        });
}

function transformSpyCreation(j, ast) {
    ast
        .find(j.CallExpression, {
            callee: {
                object: {
                    name: SINON,
                },
                property: {
                    name: 'spy',
                },
            },
        })
        .replaceWith(path => {
            switch (path.value.arguments.length) {
                case 0:
                    return j.callExpression(j.identifier('jest.fn'), []);
                case 1:
                    return j.callExpression(
                        j.identifier('jest.fn'),
                        path.value.arguments
                    );
                case 2:
                    return j.callExpression(
                        j.identifier('jest.spyOn'),
                        path.value.arguments
                    );
                default:
                    return path.value;
            }
        });
}

function transformStubReturns(j, ast) {
    ast
        .find(j.ExpressionStatement, {
            expression: {
                type: 'CallExpression',
                callee: {
                    type: 'MemberExpression',
                    object: {
                        callee: {
                            type: 'MemberExpression',
                            object: {
                                name: SINON,
                            },
                            property: {
                                name: 'stub',
                            },
                        },
                        arguments: args => {
                            return args.length !== 0;
                        },
                    },
                    property: {
                        name: 'returns',
                    },
                },
            },
        })
        .replaceWith(path => {
            // also create the auto mock if needed
            const dep = path.value.expression.callee.object.arguments[0];
            const depMethod = path.value.expression.callee.object.arguments[1];
            autoMockImport(j, ast, dep.name);
            autoMockRequire(j, ast, dep.name);

            return j.expressionStatement(
                j.callExpression(
                    j.memberExpression(
                        j.memberExpression(dep, j.identifier(depMethod.value)),
                        j.identifier('mockReturnValue')
                    ),
                    path.value.expression.arguments
                )
            );
        });
}

const SINON_CALLED_WITH_METHODS = ['calledWith', 'notCalledWith'];

function transformCalledWithAssertions(j, ast) {
    ast
        .find(j.ExpressionStatement, {
            expression: {
                callee: {
                    type: 'MemberExpression',
                    property: node => {
                        return TRUE_FALSE_MATCHERS.includes(node.name);
                    },
                    object: obj => {
                        return isExpectSinonCall(obj, SINON_CALLED_WITH_METHODS);
                    },
                },
            },
        })
        .replaceWith(path => {
            const expectArg = getExpectArg(path.value.expression.callee.object);
            const expectArgObject = expectArg.callee.object;
            const expectArgSinonMethod = expectArg.callee.property.name;
            let negation = isExpectNegation(path.value);
            if (expectArgSinonMethod === 'notCalledWith') {
                negation = negation ? false : true;
            }

            const createExpect = createExpectStatement.bind(
                null,
                j,
                expectArgObject,
                negation
            );

            switch (expectArgSinonMethod) {
                case 'calledWith':
                case 'notCalledWith':
                    return createExpect('toHaveBeenCalledWith', expectArg.arguments);
                default:
                    path.value;
            }
        });
}

const TRUE_FALSE_MATCHERS = ['toBe', 'toBeTruthy', 'toBeFalsy'];
const SINON_CALL_COUNT_METHODS = [
    'called',
    'calledOnce',
    'notCalled',
    'calledTwice',
    'calledThrice',
    'callCount',
];

function transformCallCountAssertions(j, ast) {
    ast
        .find(j.ExpressionStatement, {
            expression: {
                callee: {
                    type: 'MemberExpression',
                    property: node => {
                        return TRUE_FALSE_MATCHERS.includes(node.name);
                    },
                    object: obj => {
                        return isExpectSinonObject(obj, SINON_CALL_COUNT_METHODS);
                    },
                },
            },
        })
        .replaceWith(path => {
            const expectArg = getExpectArg(path.value.expression.callee.object);
            const expectArgObject = expectArg.object;
            const expectArgSinonMethod = expectArg.property.name;
            let negation = isExpectNegation(path.value);
            if (expectArgSinonMethod === 'notCalled') {
                negation = negation ? false : true;
            }

            const createExpect = createExpectStatement.bind(
                null,
                j,
                expectArgObject,
                negation
            );

            switch (expectArgSinonMethod) {
                case 'called':
                case 'calledOnce':
                case 'notCalled':
                    return createExpect('toHaveBeenCalled');
                case 'calledTwice':
                    return createExpect('toHaveBeenCalledTimes', [j.literal(2)]);
                case 'calledThrice':
                    return createExpect('toHaveBeenCalledTimes', [j.literal(3)]);
                default:
                    // callCount
                    return createExpect(
                        'toHaveBeenCalledTimes',
                        path.value.expression.arguments
                    );
            }
        });
}

function isExpectSinonCall(obj, sinonMethods) {
    if (obj.type === 'CallExpression' && obj.callee.name === 'expect') {
        const args = obj.arguments;
        if (args.length) {
            return (
                args[0].type === 'CallExpression' &&
                args[0].callee.type === 'MemberExpression' &&
                sinonMethods.includes(args[0].callee.property.name)
            );
        }
        return false;
    } else if (obj.type === 'MemberExpression') {
        return isExpectSinonObject(obj.object, sinonMethods);
    }
}

function isExpectSinonObject(obj, sinonMethods) {
    if (obj.type === 'CallExpression' && obj.callee.name === 'expect') {
        const args = obj.arguments;
        if (args.length) {
            return (
                args[0].type === 'MemberExpression' &&
                sinonMethods.includes(args[0].property.name)
            );
        }
        return false;
    } else if (obj.type === 'MemberExpression') {
        return isExpectSinonObject(obj.object, sinonMethods);
    }
}

function getExpectArg(obj) {
    if (obj.type === 'MemberExpression') {
        return getExpectArg(obj.object);
    } else {
        return obj.arguments[0];
    }
}

function isExpectNegation(expectStatement) {
    const propName = expectStatement.expression.callee.property.name;
    const hasNot =
        expectStatement.expression.callee.object.type === 'MemberExpression' &&
        expectStatement.expression.callee.object.property.name === 'not';
    const assertFalsy =
        (propName === 'toBe' &&
            expectStatement.expression.arguments[0].value === false) ||
        propName === 'toBeFalsy';
    if (hasNot && assertFalsy) {
        return false;
    }
    return hasNot || assertFalsy;
}

function createExpectStatement(j, expectArg, negation, assertMethod, assertArgs) {
    return j.expressionStatement(
        j.callExpression(
            j.memberExpression(
                j.callExpression(j.identifier('expect'), [expectArg]),
                j.identifier((negation ? 'not.' : '') + assertMethod)
            ),
            assertArgs ? assertArgs : []
        )
    );
}

function autoMockDepedencies(j, ast) {
    ast
        .find(j.ExpressionStatement, {
            expression: {
                type: 'CallExpression',
                callee: {
                    type: 'MemberExpression',
                    object: {
                        name: SINON,
                    },
                    property: {
                        type: 'Identifier',
                        name: 'stub',
                    },
                },
                arguments: args => {
                    return args.length !== 0;
                },
            },
        })
        .filter(path => {
            const dep = path.value.expression.arguments[0].name;
            if (autoMockImport(j, ast, dep)) {
                return true;
            }
            if (autoMockRequire(j, ast, dep)) {
                return true;
            }
            return false;
        })
        .remove();
}

function createJestMock(j, pathArg) {
    return j.expressionStatement(j.callExpression(j.identifier('jest.mock'), [pathArg]));
}

function isRequireCall(declaration, varName) {
    return (
        declaration.id.name === varName &&
        declaration.init.type === 'CallExpression' &&
        declaration.init.callee.name === 'require'
    );
}

function autoMockImport(j, ast, dep) {
    let foundImportedDep = false;
    ast
        .find(j.ImportDeclaration, {
            specifiers: specifiers => {
                return specifiers.some(s => s.local.name === dep);
            },
        })
        .forEach(path => {
            foundImportedDep = true;
            // don't create the auto mock more than once
            if (autoMockedDependencies.indexOf(dep) === -1) {
                autoMockedDependencies.push(dep);
                path.insertBefore(createJestMock(j, path.value.source));
            }
        });
    return foundImportedDep;
}

function autoMockRequire(j, ast, dep) {
    let foundRequiredDep = false;
    ast
        .find(j.VariableDeclaration, {
            declarations: declarations => {
                return declarations.some(dec => {
                    return isRequireCall(dec, dep);
                });
            },
        })
        .forEach(path => {
            const pathArg = path.value.declarations.reduce((acc, dec) => {
                if (isRequireCall(dec, dep)) {
                    return dec.init.arguments[0];
                }
                return acc;
            }, false);
            foundRequiredDep = true;
            // don't create the auto mock more than once
            if (autoMockedDependencies.indexOf(dep) === -1) {
                autoMockedDependencies.push(dep);
                path.insertBefore(createJestMock(j, pathArg));
            }
        });
    return foundRequiredDep;
}
