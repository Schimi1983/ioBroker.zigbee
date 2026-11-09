'use strict';

// Regression tests for object ids of instances with a two-digit number (zigbee.10 and up).
//
// The ids were split with /zigbee.[0-9].[^.]+.(\S+)/, which only matches one digit. For zigbee.10
// the user commands were dropped ("unable to extract id from state") and groups got no members in
// the admin tab. utils.splitInstanceId() splits by the namespace instead.
// Also covers the key publishToDefinedState() reports for meta_state: a value of false or 0 was
// reported under the wrong key because of the operator precedence of ?? and ==.
//
// Runs the real classes against a stubbed @iobroker/adapter-core; no hardware.
// Run:  node --test test/instanceIds.test.js

const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { describe, it } = require('node:test');
const assert = require('node:assert');

class FakeAdapterBase extends EventEmitter {
    constructor() {
        super();
        this.name = 'zigbee';
        this.namespace = 'zigbee.10';
        this.config = {};
        this.log = { debug() {}, info() {}, warn() {}, error() {}, level: 'info' };
    }
    expandFileName(f) {
        return '/nonexistent/' + f;
    }
    setTimeout() {}
    clearTimeout() {}
    setInterval() {}
    clearInterval() {}
    getStateAsync() {
        return Promise.resolve(null);
    }
    subscribeStates() {}
}

const origLoad = Module._load;
Module._load = function (request, ...rest) {
    if (request === '@iobroker/adapter-core') return { Adapter: FakeAdapterBase };
    return origLoad.call(this, request, ...rest);
};

const utils = require('../lib/utils');
const factory = require('../main.js');

describe('utils.splitInstanceId', () => {
    it('splits ids of a one-digit instance', () => {
        assert.deepStrictEqual(utils.splitInstanceId('zigbee.0', 'zigbee.0.00158d0001234567.state'), {
            device: '00158d0001234567',
            state: 'state',
        });
    });

    it('splits ids of a two-digit instance', () => {
        assert.deepStrictEqual(utils.splitInstanceId('zigbee.10', 'zigbee.10.00158d0001234567.state'), {
            device: '00158d0001234567',
            state: 'state',
        });
    });

    it('keeps nested state ids', () => {
        assert.deepStrictEqual(utils.splitInstanceId('zigbee.10', 'zigbee.10.group_3.color.x'), {
            device: 'group_3',
            state: 'color.x',
        });
    });

    it('returns the device without state for a device id', () => {
        assert.deepStrictEqual(utils.splitInstanceId('zigbee.10', 'zigbee.10.group_3'), { device: 'group_3', state: undefined });
    });

    it('rejects ids of another instance', () => {
        assert.strictEqual(utils.splitInstanceId('zigbee.1', 'zigbee.10.00158d0001234567.state'), undefined);
    });
});

describe('user commands on zigbee.10', () => {
    it('passes the state key on to the device', async () => {
        const adapter = factory({});
        adapter.zbController = { connected: () => true };
        adapter.getObjectAsync = () => Promise.resolve({ common: { type: 'TS011F' } });
        const published = [];
        adapter.stController.collectOptions = (devId, model, getOptionStates, callback) => callback({});
        adapter.stController.publishFromState = (deviceId, model, stateKey) => published.push(stateKey);

        await adapter.stController.onStateChange('zigbee.10.00158d0001234567.state', { val: true, ack: false });

        assert.deepStrictEqual(published, ['state']);
    });
});

describe('publishToDefinedState key for meta_state', () => {
    const statedesc = { id: 'smoke_alarm', prop: 'manual_smoke_alarm', name: 'alarm', type: 'boolean' };

    async function keyFor(value) {
        const adapter = factory({});
        adapter.stController.updateState = () => {};
        const result = await adapter.stController.publishToDefinedState('00158d0001234567', 'BSD-2', statedesc, {
            manual_smoke_alarm: value,
        });
        return result.key;
    }

    it('reports a true value under the property name', async () => {
        assert.strictEqual(await keyFor(true), 'manual_smoke_alarm');
    });

    it('reports a false value under the property name', async () => {
        assert.strictEqual(await keyFor(false), 'manual_smoke_alarm');
    });

    it('reports the state id when the payload does not carry the property', async () => {
        const adapter = factory({});
        adapter.stController.updateState = () => {};
        const result = await adapter.stController.publishToDefinedState(
            '00158d0001234567',
            'BSD-2',
            { id: 'smoke_alarm', name: 'alarm', type: 'boolean' },
            { smoke_alarm: true },
        );
        assert.strictEqual(result.key, 'smoke_alarm');
    });
});
