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
    'converts stub import/require dependencies',
    `
    import sinon from 'sinon';
    import dep2 from 'dep2';
    import * as dep3 from '../dep3';
    const dep1 = require('dep1');
    const dep4 = require('dep4');
    const dep5 = require('dep5');

    test(() => {
      sinon.stub(dep2, 'method1');
      sinon.stub(dep1, 'method2');
      sinon.stub(dep3, 'method3');
      sinon.stub(dep4, 'method2').returns('hello');
      sinon.spy(dep5, 'method1');
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
    const dep5 = require('dep5');

    test(() => {
      dep4.method2.mockReturnValue('hello');
      sinon.spy(dep5, 'method1');
    });
    `
);

testChanged(
    'converts spy call count assertions',
    `
    import sinon from 'sinon';

    test(() => {
      expect(spy.called).toBe(true);
      expect(spy.called).toBeTruthy();
      expect(spy.called).toBe(false);
      expect(spy.called).toBeFalsy();
      expect(spy.called).not.toBe(true);
      expect(spy.called).not.toBeTruthy();
      expect(spy.called).not.toBeFalsy();
      expect(spy.called).not.toBe(false);
      expect(bob.spy.called).toBe(true);

      expect(spy.calledOnce).toBe(true);
      expect(spy.calledOnce).toBeTruthy();
      expect(spy.calledOnce).toBe(false);
      expect(spy.calledOnce).toBeFalsy();
      expect(spy.calledOnce).not.toBe(true);
      expect(spy.calledOnce).not.toBeTruthy();
      expect(spy.calledOnce).not.toBeFalsy();
      expect(spy.calledOnce).not.toBe(false);
      expect(bob.spy.calledOnce).toBe(true);

      expect(spy.notCalled).toBe(true);
      expect(spy.notCalled).toBeTruthy();
      expect(spy.notCalled).toBe(false);
      expect(spy.notCalled).toBeFalsy();

      expect(spy.calledTwice).toBe(true);
      expect(spy.calledTwice).toBeTruthy();
      expect(spy.calledTwice).not.toBe(true);
      expect(spy.calledTwice).toBeFalsy();

      expect(spy.calledThrice).toBe(true);
      expect(spy.calledThrice).toBeTruthy();
      expect(spy.calledThrice).not.toBe(true);
      expect(spy.calledThrice).toBeFalsy();

      expect(spy.callCount).toBe(8);
      expect(spy.callCount).not.toBe(8);
    });
    `,
    `
    test(() => {
      expect(spy).toHaveBeenCalled();
      expect(spy).toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();
      expect(spy).toHaveBeenCalled();
      expect(spy).toHaveBeenCalled();
      expect(bob.spy).toHaveBeenCalled();

      expect(spy).toHaveBeenCalled();
      expect(spy).toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();
      expect(spy).toHaveBeenCalled();
      expect(spy).toHaveBeenCalled();
      expect(bob.spy).toHaveBeenCalled();

      expect(spy).not.toHaveBeenCalled();
      expect(spy).not.toHaveBeenCalled();
      expect(spy).toHaveBeenCalled();
      expect(spy).toHaveBeenCalled();

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).not.toHaveBeenCalledTimes(2);
      expect(spy).not.toHaveBeenCalledTimes(2);

      expect(spy).toHaveBeenCalledTimes(3);
      expect(spy).toHaveBeenCalledTimes(3);
      expect(spy).not.toHaveBeenCalledTimes(3);
      expect(spy).not.toHaveBeenCalledTimes(3);

      expect(spy).toHaveBeenCalledTimes(8);
      expect(spy).not.toHaveBeenCalledTimes(8);
    });
    `
);
