import { getRequireOrImportName, removeRequireAndImport } from '../utils/imports';
//import logger from '../utils/logger';
import finale from '../utils/finale';

const MATCHER_METHODS = ['stub', 'spy', 'mock'];

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

    return finale(fileInfo, j, ast, options, sinonImport);
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
                    property: node => {
                        return (
                            node.type === 'Identifier' &&
                            MATCHER_METHODS.indexOf(node.name) !== -1
                        );
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
