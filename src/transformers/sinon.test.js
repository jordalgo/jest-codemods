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

// test('some jest thing', () => {
//     var oG = { hello: () => 'hello' };
//     jest.spyOn(oG, 'hello').mockImplementation(() => 'bye');
//     expect(oG.hello()).toBe('bye');
// });

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
    'converts sinon.mock() to jest.fn()',
    `
    import sinon from 'sinon';

    test(() => {
        var a = sinon.mock();
    });
    `,
    `
    test(() => {
        var a = jest.fn();
    });
    `
);

testChanged(
    'converts sinon.stub(object, "method") to spyOn',
    `
    import sinon from 'sinon';

    test(() => {
        sinon.stub(obj, 'method1');
        sinon.stub(obj, 'method2').returns('hello');
        var stub = sinon.stub(obj, 'method3');
        var stub2 = sinon.stub(obj, 'method4');
        var stub3 = sinon.stub();
        var stub4 = sinon.stub().returns('hello');
        stub2.returns('bye');
    });
    `,
    `
    test(() => {
        jest.spyOn(obj, 'method1').mockReturnValue(undefined);
        jest.spyOn(obj, 'method2').mockReturnValue('hello');
        var stub = jest.spyOn(obj, 'method3').mockReturnValue(undefined);
        var stub2 = jest.spyOn(obj, 'method4').mockReturnValue(undefined);
        var stub3 = jest.fn();
        var stub4 = jest.fn().mockReturnValue('hello');
        stub2.mockReturnValue('bye');
    });
    `
);

testChanged(
    'converts sinon.stub(object, "method").returnsArg',
    `
    import sinon from 'sinon';

    test(() => {
        sinon.stub(obj, 'method3').returnsArg(0);
        sinon.stub(obj, 'method3').returnsArg(10);
    });
    `,
    `
    test(() => {
        jest.spyOn(obj, 'method3').mockImplementation((...args) => args[0]);
        jest.spyOn(obj, 'method3').mockImplementation((...args) => args[10]);
    });
    `
);

testChanged(
    'converts sinon.stub(object, "method").returnsThis',
    `
    import sinon from 'sinon';

    test(() => {
        sinon.stub(obj, 'method3').returnsThis();
    });
    `,
    `
    test(() => {
        jest.spyOn(obj, 'method3').mockReturnThis();
    });
    `
);

testChanged(
    'converts sinon.stub(object, "method").resolves/rejects',
    `
    import sinon from 'sinon';

    test(() => {
        sinon.stub(obj, 'method3').resolves(obj);
        sinon.stub(obj, 'method3').rejects(error);
        var stub4 = sinon.stub().resolves('hello');
        var stub5 = sinon.stub().rejects('bye');
    });
    `,
    `
    test(() => {
        jest.spyOn(obj, 'method3').mockResolvedValue(obj);
        jest.spyOn(obj, 'method3').mockRejectedValue(error);
        var stub4 = jest.fn().mockResolvedValue('hello');
        var stub5 = jest.fn().mockRejectedValue('bye');
    });
    `
);

testChanged(
    'converts sinon.spy(object, "method") to spyOn',
    `
    import sinon from 'sinon';

    test(() => {
        var spy = sinon.spy();
        var spy = sinon.spy(fn);
        var spy = sinon.spy(object, 'method');
        sinon.spy(object, 'method');
    });
    `,
    `
    test(() => {
        var spy = jest.fn();
        var spy = jest.fn(fn);
        var spy = jest.spyOn(object, 'method');
        jest.spyOn(object, 'method');
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

testChanged(
    'converts get call methods',
    `
    import sinon from 'sinon';

    test(() => {
        expect(spy.firstCall).toBeTruthy();
        expect(spy.secondCall).toBeTruthy();
        expect(spy.thirdCall).toBeTruthy();
        expect(spy.lastCall).toBeTruthy();
        var spyCalls = spy.getCalls();
        var spyCall4 = spy.getCall(4);
        var spyCall = spy.getCall(n);

        var args = spy.getCall(0).args;
        var arg1 = spy.getCall(0).args[0];
        expect(spy.getCall(0).args[0]).toBe(1);
        expect(spy.firstCall.args).toBe(x);
        expect(spy.secondCall.args).toBe(x);
        expect(spy.thirdCall.args).toBe(x);
        expect(spy.lastCall.args).toBe(x);
        expect(spy.firstCall.args[0]).toBe(x);
        expect(spy.secondCall.args[0]).toBe(x);
        expect(spy.thirdCall.args[0]).toBe(x);
        expect(spy.lastCall.args[0]).toBe(x);
    });
    `,
    `
    test(() => {
        expect(spy.mock.calls[0]).toBeTruthy();
        expect(spy.mock.calls[1]).toBeTruthy();
        expect(spy.mock.calls[2]).toBeTruthy();
        expect(spy.mock.calls[spy.mock.calls.length - 1]).toBeTruthy();
        var spyCalls = spy.mock.calls;
        var spyCall4 = spy.mock.calls[4];
        var spyCall = spy.mock.calls[n];

        var args = spy.mock.calls[0];
        var arg1 = spy.mock.calls[0][0];
        expect(spy.mock.calls[0][0]).toBe(1);
        expect(spy.mock.calls[0]).toBe(x);
        expect(spy.mock.calls[1]).toBe(x);
        expect(spy.mock.calls[2]).toBe(x);
        expect(spy.mock.calls[spy.mock.calls.length - 1]).toBe(x);
        expect(spy.mock.calls[0][0]).toBe(x);
        expect(spy.mock.calls[1][0]).toBe(x);
        expect(spy.mock.calls[2][0]).toBe(x);
        expect(spy.mock.calls[spy.mock.calls.length - 1][0]).toBe(x);
    });
    `
);

testChanged(
    'converts calledWith methods',
    `
    import sinon from 'sinon';

    test(() => {
        expect(spy.calledWith(1, 2, 3)).toBe(true);
        expect(spy.calledWith(1, 2, 3)).toBeTruthy();

        expect(spy.notCalledWith(1, 2, 3)).toBe(true);
        expect(spy.notCalledWith(1, 2, 3)).toBeTruthy();
    });
    `,
    `
    test(() => {
        expect(spy).toHaveBeenCalledWith(1, 2, 3);
        expect(spy).toHaveBeenCalledWith(1, 2, 3);

        expect(spy).not.toHaveBeenCalledWith(1, 2, 3);
        expect(spy).not.toHaveBeenCalledWith(1, 2, 3);
    });
    `
);
