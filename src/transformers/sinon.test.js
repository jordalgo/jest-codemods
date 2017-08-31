/* eslint-env jest */
import chalk from 'chalk';
import { wrapPlugin } from '../utils/test-helpers';
import plugin from './sinon';

chalk.enabled = false;
const wrappedPlugin = wrapPlugin(plugin);

let consoleWarnings = [];
beforeEach(() => {
    consoleWarnings = [];
    console.warn = v => consoleWarnings.push(v);
});

function testChanged(msg, source, expectedOutput, options = {}) {
    test(msg, () => {
        const result = wrappedPlugin(source, options);
        expect(result).toBe(expectedOutput);
        expect(consoleWarnings).toEqual([]);

        // Running it twice should yield same result
        expect(wrappedPlugin(result, options)).toBe(result);
    });
}

testChanged(
    'does not touch code without sinon require/import',
    `
    const test = require("testlib");
    test(t => {
      sinon.stub(test, 'this');
    })
    `,
    `
    const test = require("testlib");
    test(t => {
      sinon.stub(test, 'this');
    })
    `
);

testChanged(
    'removes sinon import and require',
    `
    import sinon from 'sinon';
    const sinon = require('sinon');

    test(() => {
    });
    `,
    `
    test(() => {
    });
    `
);

testChanged(
    'converts stubbed & spied import/require dependencies',
    `
    import sinon from 'sinon';
    import dep2 from 'dep2';
    import * as dep3 from '../dep3';
    const dep1 = require('dep1');
    const dep4 = require('dep4');

    test(() => {
      sinon.stub(dep2, 'method1');
      sinon.spy(dep1, 'method2');
      sinon.mock(dep3);
      sinon.stub(dep4, 'method2').returns('hello');
    });
    `,
    `
    jest.mock('dep2');
    import dep2 from 'dep2';
    jest.mock('../dep3');
    import * as dep3 from '../dep3';
    jest.mock('dep1');
    const dep1 = require('dep1');
    jest.mock('dep4');
    const dep4 = require('dep4');

    test(() => {
      dep4.method2.mockReturnValue('hello');
    });
    `
);
