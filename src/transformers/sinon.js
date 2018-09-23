import { getRequireOrImportName, removeRequireAndImport } from '../utils/imports';
//import logger from '../utils/logger';
import finale from '../utils/finale';

// Todos: window functions should be global

/*
   These Sinon methods are not yet supported:
   Spies:
   - withArgs
   - calledBefore*
   - calledAfter*
   - calledImmediatelyBefore*
   - calledImmediatelyAfter*
   - calledOn*
   - alwaysCalledOn*
   - calledOnceWith
   - alwaysCalledWith*
   - calledWithExactly*
   - calledOnceWithExactly*
   - alwaysCalledWithExactly*
   - alwaysCalledWithMatch*
   - calledWithNew*
   - neverCalledWith*
   - neverCalledWithMatch*
   - threw* (not quite the same as toThrow)
   - alwaysThrew*
   - returned
   - alwaysReturned*
   - thisValues*
   - returnValues (use 'results')
   - exceptions (use 'results')
   - resetHistory
   - restore
   Stubs:
   - withArgs*
   - onCall*
   - onFirstCall*
   - onSecondCall*
   - onThirdCall*
   - resetBehavior (use 'mockReturnValue')
   - resetHistory (use 'mockReset')
   - callsFake
   - callThrough*
   - callsArgOn
   - callsArgWith
   - callsArgOnWith
   - usingPromise*^
   - yields
   - yieldsRight
   - yieldsOn
   - yieldsTo
   - yieldsToOn
   - yield*
   - yieldTo*
   - callArg
   - callArgWith
   - addBehavior*
   - get*
   - set*
   - value*
   Mocks:
   - It seems like all the mock methods are set up to be expectations of what will happen once code is executed
   but the Jest API checks after the fact e.g. 'toHaveBeen'. Probably would involve some fun codeshift trickery
   to switch Sinon Mocks to Jest.

   * No direct Jest equivalent
   ^ Probably a method we don't need to duplicate

   Below are all the API groups that have no support yet for any method
   - Fake timers
   - Fake XHR and server
   - JSON-P
   - Matchers
   - Assertions
   - Fakes (Probably can take a lot from stub and spy shifts)

*/

const SINON = 'sinon';
const SINON_CALLED_WITH_METHODS = ['calledWith', 'notCalledWith'];
const TRUE_FALSE_MATCHERS = ['toBe', 'toBeTruthy', 'toBeFalsy'];
const SINON_CALL_COUNT_METHODS = [
    'called',
    'calledOnce',
    'notCalled',
    'calledTwice',
    'calledThrice',
    'callCount',
];

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

    [
        transformSinonMock,
        transformCallCountAssertions,
        transformCalledWithAssertions,
        transformSpyCreation,
        transformStubCreation,
        transformGetCallMethos,
    ].forEach(fn => {
        fn(j, ast);
    });

    return finale(fileInfo, j, ast, options, sinonImport);
}

/**
 * Transformations
 */

// sinon.mock() -> jest.fn()
function transformSinonMock(j, ast) {
    ast
        .find(j.CallExpression, {
            callee: {
                object: {
                    name: SINON,
                },
                property: {
                    name: 'mock',
                },
            },
        })
        .replaceWith(path => {
            return createJestFn(j);
        });
}

/**
 * There is no direct equivalent for sinon.stub in Jest
 * so use jest.spyOn and 'mockReturnValue'
 * e.g. sinon.stub(obj, 'method1') -> jest.spyOn(obj, 'method1').mockReturnValue(undefined);
 */
function transformStubCreation(j, ast) {
    ast
        .find(j.ExpressionStatement, {
            expression: {
                type: 'CallExpression',
                callee: isSinonStubCall,
            },
        })
        .replaceWith(path => {
            return j.expressionStatement(createJestSpyCall(j, path.value.expression));
        });

    /*
    * Find the sinon variables that specify return values after the fact e.g.
    * var stub2 = sinon.stub(obj, 'method4');
    * stub2.returns('bye').
    */
    ast
        .find(j.VariableDeclarator, {
            init: {
                type: 'CallExpression',
                callee: isSinonStubCall,
            },
        })
        .replaceWith(path => {
            ast
                .find(j.CallExpression, {
                    callee: {
                        type: 'MemberExpression',
                        object: {
                            name: path.value.id.name,
                        },
                    },
                })
                .replaceWith(subPath => {
                    return j.callExpression(
                        j.memberExpression(
                            subPath.value.callee.object,
                            j.identifier('mockReturnValue')
                        ),
                        subPath.value.arguments
                    );
                });

            return j.variableDeclarator(
                path.value.id,
                createJestSpyCall(j, path.value.init)
            );
        });
}

// spy.firstCall -> spy.mock.calls[0]
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

    // remove `.args` from these type of sinon call methods
    ast
        .find(j.MemberExpression, {
            object: {
                type: 'MemberExpression',
                property: {
                    name: name => methods.includes(name),
                },
            },
            property: {
                type: 'Identifier',
                name: 'args',
            },
        })
        .replaceWith(path => {
            return path.value.object;
        });

    ast
        .find(j.MemberExpression, {
            object: {
                type: 'CallExpression',
                callee: {
                    type: 'MemberExpression',
                    property: {
                        name: 'getCall',
                    },
                },
            },
            property: {
                type: 'Identifier',
                name: 'args',
            },
        })
        .replaceWith(path => {
            return path.value.object;
        });

    // now replace the call methods
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

// sinon.spy(object, 'method') -> jest.spyOn(object, 'method')
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
                    return createJestFn(j);
                case 1:
                    return createJestFn(j, path.value.arguments);
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

//  expect(spy.calledWith(1, 2, 3)).toBe(true) -> expect(spy).toHaveBeenCalledWith(1, 2, 3);
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

//  expect(spy.called).toBe(true) -> expect(spy).toHaveBeenCalled()
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

/**
 * Helper Functions
 */

function isSinonStubCall(callee) {
    if (callee.object && callee.object.type === 'CallExpression') {
        return isSinonStubCall(callee.object.callee);
    }
    if (
        callee.type === 'MemberExpression' &&
        callee.object.name === SINON &&
        callee.property.name === 'stub'
    ) {
        return true;
    }
    return false;
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

const returnMap = {
    returns: 'mockReturnValue',
    returnsThis: 'mockReturnThis',
    resolves: 'mockResolvedValue',
    rejects: 'mockRejectedValue',
};

function createJestSpyCall(j, callExpression) {
    const callee = callExpression.callee;
    const args = callExpression.arguments;
    if (callee.object.type === 'CallExpression') {
        const jestReturn = returnMap[callee.property.name];
        if (callee.property && jestReturn) {
            if (callee.object.arguments.length) {
                return j.callExpression(
                    j.memberExpression(
                        j.callExpression(
                            j.identifier('jest.spyOn'),
                            callee.object.arguments
                        ),
                        j.identifier(jestReturn)
                    ),
                    args
                );
            } else {
                return j.callExpression(
                    j.memberExpression(createJestFn(j), j.identifier(jestReturn)),
                    args
                );
            }
        } else if (callee.property && callee.property.name === 'returnsArg') {
            return j.callExpression(createJestSpyOn(j, callee.object.arguments), [
                j.arrowFunctionExpression(
                    [j.restElement(j.identifier('args'))],
                    j.memberExpression(j.identifier('args'), args[0])
                ),
            ]);
        } else if (callee.property && callee.property.name === 'resolvesArg') {
            return j.callExpression(createJestSpyOn(j, callee.object.arguments), [
                j.arrowFunctionExpression(
                    [j.restElement(j.identifier('args'))],
                    j.callExpression(j.identifier('Promise.resolve'), [
                        j.memberExpression(j.identifier('args'), args[0]),
                    ])
                ),
            ]);
        } else if (callee.property && callee.property.name === 'callArg') {
            return j.callExpression(createJestSpyOn(j, callee.object.arguments), [
                j.arrowFunctionExpression(
                    [j.restElement(j.identifier('args'))],
                    j.callExpression(
                        j.memberExpression(j.identifier('args'), args[0]),
                        []
                    )
                ),
            ]);
        } else if (callee.property && callee.property.name === 'throwsArg') {
            // Todo: add check for length of params to throw TypeError if arg is not available ()
            return j.callExpression(createJestSpyOn(j, callee.object.arguments), [
                j.arrowFunctionExpression(
                    [j.restElement(j.identifier('args'))],
                    j.blockStatement([
                        j.throwStatement(
                            j.memberExpression(j.identifier('args'), args[0])
                        ),
                    ])
                ),
            ]);
        } else if (callee.property && callee.property.name === 'throws') {
            if (args.length) {
                const firstArg = args[0];
                if (
                    firstArg.type === 'FunctionExpression' ||
                    firstArg.type === 'ArrowFunctionExpression'
                ) {
                    return j.callExpression(createJestSpyOn(j, callee.object.arguments), [
                        j.arrowFunctionExpression(
                            [],
                            j.blockStatement([
                                j.throwStatement(j.callExpression(firstArg, [])),
                            ])
                        ),
                    ]);
                }
                return j.callExpression(createJestSpyOn(j, callee.object.arguments), [
                    j.arrowFunctionExpression(
                        [],
                        j.blockStatement([j.throwStatement(firstArg)])
                    ),
                ]);
            } else {
                return j.callExpression(createJestSpyOn(j, callee.object.arguments), [
                    j.arrowFunctionExpression(
                        [],
                        j.blockStatement([
                            j.throwStatement(j.callExpression(j.identifier('Error'), [])),
                        ])
                    ),
                ]);
            }
        }
    }
    if (args.length) {
        return j.callExpression(
            j.memberExpression(
                j.callExpression(j.identifier('jest.spyOn'), args),
                j.identifier('mockReturnValue')
            ),
            [j.identifier('undefined')]
        );
    } else {
        return createJestFn(j);
    }
}

function getExpectArg(obj) {
    if (obj.type === 'MemberExpression') {
        return getExpectArg(obj.object);
    } else {
        return obj.arguments[0];
    }
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

function createJestFn(j, args = []) {
    return j.callExpression(j.identifier('jest.fn'), args);
}

function createJestSpyOn(j, args = []) {
    const call = args.length
        ? j.callExpression(j.identifier('jest.spyOn'), args)
        : createJestFn(j);
    return j.memberExpression(call, j.identifier('mockImplementation'));
}
