// SPDX-License-Identifier: LGPL-3.0-or-later
// Copyright © 2021 fvtt-lib-wrapper Rui Pinheiro

'use strict';

import test from 'tape';
import {CallOrderChecker} from './call_order_checker.js';
import {wrap_front, unwrap_all_from_obj, test_sync_async, async_retval, is_promise, sync_async_then} from './utilities.js';
import '../src/lib/lib-wrapper.js';


function setup() {
	libWrapper._unwrap_all();
	libWrapper.load_priorities();

	game.clear_modules();
}



// Main functionality of libWrapper
test_sync_async('Library: Main', async function (t) {
	setup();
	const chkr = new CallOrderChecker(t);


	// Define class
	class A {};
	A.prototype.x = chkr.gen_rt('Orig');
	globalThis.A = A;


	// Instantiate
	let a = new A();
	await chkr.call(a, 'x', ['Orig',-1]);

	// Register MIXED (default value)
	game.add_module('m1');
	libWrapper.register('m1', 'A.prototype.x', chkr.gen_wr('m1:Mix:1'));
	await chkr.call(a, 'x', ['m1:Mix:1','Orig',-2]);

	// Registering the same method twice with the same module should fail
	t.throws(function() {
		libWrapper.register('module1', 'A.prototype.x', () => {});
	}, libWrapper.Error, 'Registering twice with same module should fail');
	await chkr.call(a, 'x', ['m1:Mix:1','Orig',-2]);

	// Register WRAPPER
	game.add_module('m2');
	libWrapper.register('m2', 'A.prototype.x', chkr.gen_wr('m2:Wrp:2'), 'WRAPPER');
	await chkr.call(a, 'x', ['m2:Wrp:2','m1:Mix:1','Orig',-3]);

	// Register OVERRIDE
	game.add_module('m3');
	libWrapper.register('m3', 'A.prototype.x', chkr.gen_wr('m3:Ovr:3', {override: true}), 'OVERRIDE');
	await chkr.call(a, 'x', ['m2:Wrp:2','m1:Mix:1','m3:Ovr:3',-3]);

	// Registing another OVERRIDE should fail
	game.add_module('m4');
	t.throws(function() {
		libWrapper.register('m4', 'A.prototype.x', () => {}, 'OVERRIDE');
	}, libWrapper.AlreadyOverriddenError, 'Registering second override should fail');
	await chkr.call(a, 'x', ['m2:Wrp:2','m1:Mix:1','m3:Ovr:3',-3]);

	// Unless the module has a higher priority
	libWrapper.load_priorities({
		prioritized: {
			'm4': {index: 0}
		}
	});
	libWrapper.register('m4', 'A.prototype.x', chkr.gen_wr('m4:Ovr:4', {override: true}), 'OVERRIDE');
	await chkr.call(a, 'x', ['m2:Wrp:2','m1:Mix:1','m4:Ovr:4',-3]);

	// Removing this override should bring back the previous override
	libWrapper.unregister('m4', 'A.prototype.x');
	await chkr.call(a, 'x', ['m2:Wrp:2','m1:Mix:1','m3:Ovr:3',-3]);

	// Remove prioritization
	libWrapper.load_priorities();

	// Try removing m2
	libWrapper.unregister('m2', 'A.prototype.x');
	await chkr.call(a, 'x', ['m1:Mix:1','m3:Ovr:3',-2]);

	// Add a WRAPPER that does not chain
	libWrapper.register('m2', 'A.prototype.x', chkr.gen_wr('m2:Wrp:5', {nochain: true}), 'WRAPPER');
	await chkr.call(a, 'x', ['m2:Wrp:5',-1,'m1:Mix:1','m3:Ovr:3',-2]);

	// WRAPPERs that don't chain get unregistered automatically
	await chkr.call(a, 'x', ['m1:Mix:1','m3:Ovr:3',-2]);

	// Add a MIXED that does not chain, this time not relying on the default parameter
	libWrapper.register('m2', 'A.prototype.x', chkr.gen_wr('m2:Mix:6'), 'MIXED');
	await chkr.call(a, 'x', ['m2:Mix:6','m1:Mix:1','m3:Ovr:3',-3]);


	// Try clearing 'A.prototype.x'
	const pre_clear = A.prototype.x;
	libWrapper._clear('A.prototype.x');
	await chkr.call(a, 'x', ['Orig',-1], {title: 'A.prototype.X cleared #1'});
	await chkr.check(pre_clear.call(a), ['Orig',-1], {title: 'A.prototype.X cleared #2'});

	// Try to wrap again
	libWrapper.register('m1', 'A.prototype.x', chkr.gen_wr('m1:Mix:7'));
	await chkr.call(a, 'x', ['m1:Mix:7','Orig',-2]);

	// Test manual wrapping
	A.prototype.x = (function() {
		const wrapped = A.prototype.x;
		return chkr.gen_rt('Man:8', {next: wrapped});
	})();
	await chkr.call(a, 'x', ['m1:Mix:7','Man:8','Orig',-3]);


	// Test invalid getter
	t.throws(() => libWrapper.register('m1', 'A.prototype.xyz', ()=>{}), libWrapper.ModuleError, "Wrap invalid getter");

	// Test invalid setter
	t.throws(() => libWrapper.register('m1', 'A.prototype.x#set', ()=>{}), libWrapper.ModuleError, "Wrap invalid setter");
	t.throws(() => libWrapper.register('m1', 'A.prototype.xyz#set', ()=>{}), libWrapper.ModuleError, "Wrap invalid setter");


	// Done
	t.end();
});



// Special functionality / corner cases
test_sync_async('Library: Special', async function (t) {
	setup();
	const chkr = new CallOrderChecker(t);


	// Define class
	class A {};
	A.prototype.x = chkr.gen_rt('Orig');
	globalThis.A = A;


	// Instantiate
	let a = new A();
	await chkr.call(a, 'x', ['Orig',-1]);


	// Chain wrapper twice
	game.add_module('m1');
	libWrapper.register('m1', 'A.prototype.x', chkr.gen_fn('m1:Wrp:1',
		(frm, chain) => sync_async_then(chain(), v => chain())
	), 'WRAPPER');
	await chkr.call(a, 'x', ['m1:Wrp:1','Orig',-1,'Orig',-2]);

	// Unregister
	libWrapper.unregister('m1', 'A.prototype.x');
	await chkr.call(a, 'x', ['Orig',-1]);


	// Clear inside wrapper (before call)
	libWrapper.register('m1', 'A.prototype.x', chkr.gen_fn('m1:Wrp:2',
		function(frm, chain) {
			libWrapper.clear_module('m1');
			return chain();
		}
	), 'WRAPPER');
	// First call runs as if nothing was unregistered
	await chkr.call(a, 'x', ['m1:Wrp:2','Orig',-2]);
	// Second call sees the fact that the wrapper was unregistered
	await chkr.call(a, 'x', ['Orig',-1]);


	// Clear inside wrapper (after call)
	libWrapper.register('m1', 'A.prototype.x', chkr.gen_fn('m1:Wrp:3',
		function(frm, chain) {
			return sync_async_then(chain(), v => {
				libWrapper.clear_module('m1');
				return v;
			})
		}
	), 'WRAPPER');
	await chkr.call(a, 'x', ['m1:Wrp:3','Orig',-2]);


	// Call from outside wrapper
	let stored_wrapped = null;
	libWrapper.register('m1', 'A.prototype.x', chkr.gen_fn('m1:Wrp:4',
		function(frm, chain) {
			stored_wrapped = chain;
			return chain();
		}
	), 'WRAPPER');
	await chkr.call(a, 'x', ['m1:Wrp:4','Orig',-2]);
	t.throws(() => stored_wrapped(), libWrapper.InvalidWrapperChainError, 'Call from outside wrapper');


	// Done
	t.end();
});



// Functionality related to wrapping a setter
// Sync-only as it makes no sense to call a setter asynchronously
test('Library: Setter', function (t) {
	setup();
	const chkr = new CallOrderChecker(t);


	// Define class
	let x_id = 'Orig1';
	class A {
		constructor() {
			console.log('construct', this.constructor.name);
			this.x_id = 'Orig1';
		}
	};

	Object.defineProperty(
		A.prototype,
		'x',
		{
			get: function(...args) {
				return chkr.gen_rt(this.x_id).apply(this, args);
			},
			set: function(...args) {
				const retval = chkr.gen_rt(`${this.x_id}#set`).apply(this, args);
				this.x_id = args[0];
				return retval;
			},
			configurable: true
		}
	);

	globalThis.A = A;


	class B extends A {};
	globalThis.B = B;


	// Instantiate
	let a = new A();
	chkr.check(a.x, ['Orig1',-1]);

	a.x = 'Orig2';
	chkr.check('Orig1#set', ['Orig1#set',-1], {param_in: ['Orig2']});

	t.equals(a.x_id, 'Orig2', 'Post-setter #1');
	chkr.check(a.x, ['Orig2',-1]);



	// Register MIXED
	game.add_module('m1');
	libWrapper.register('m1', 'A.prototype.x', chkr.gen_wr('m1:Mix:1'));
	chkr.check(a.x, ['m1:Mix:1','Orig2',-2]);


	// Register MIXED wrapper for setter
	libWrapper.register('m1', 'A.prototype.x#set', chkr.gen_wr('m1:Mix:1#set'));

	a.x = 'Orig3';
	chkr.check('m1:Mix:1#set', ['m1:Mix:1#set','Orig2#set',-2], {param_in: ['Orig3']});

	t.equals(a.x_id, 'Orig3', 'Post-setter #2');
	chkr.check(a.x, ['m1:Mix:1','Orig3',-2]);


	a.x = 'Orig4';
	chkr.check('m1:Mix:1#set', ['m1:Mix:1#set','Orig3#set',-2], {param_in: ['Orig4']});
	t.equals(a.x_id, 'Orig4', 'Post-setter #3');
	chkr.check(a.x, ['m1:Mix:1','Orig4',-2]);


	// Register second set of wrappers
	game.add_module('m2');
	libWrapper.register('m2', 'A.prototype.x', chkr.gen_wr('m2:Mix:2'));
	chkr.check(a.x, ['m2:Mix:2','m1:Mix:1','Orig4',-3]);

	libWrapper.register('m2', 'A.prototype.x#set', chkr.gen_wr('m2:Mix:2#set'));

	a.x = 'Orig5';
	chkr.check('m2:Mix:2#set', ['m2:Mix:2#set','m1:Mix:1#set','Orig4#set',-3], {param_in: ['Orig5']});

	t.equals(a.x_id, 'Orig5', 'Post-setter #4');
	chkr.check(a.x, ['m2:Mix:2','m1:Mix:1','Orig5',-3]);


	a.x = 'Orig6';
	chkr.check('m2:Mix:2#set', ['m2:Mix:2#set','m1:Mix:1#set','Orig5#set',-3], {param_in: ['Orig6']});
	t.equals(a.x_id, 'Orig6', 'Post-setter #5');
	chkr.check(a.x, ['m2:Mix:2','m1:Mix:1','Orig6',-3]);


	// Unregister getter wrapper
	libWrapper.unregister('m1', 'A.prototype.x');

	a.x = 'Orig7';
	chkr.check('m2:Mix:2#set', ['m2:Mix:2#set','m1:Mix:1#set','Orig6#set',-3], {param_in: ['Orig7']});
	t.equals(a.x_id, 'Orig7', 'Post-setter #6');
	chkr.check(a.x, ['m2:Mix:2','Orig7',-2]);


	// Unregister setter wrapper
	libWrapper.unregister('m1', 'A.prototype.x#set');

	a.x = 'Orig8';
	chkr.check('m2:Mix:2#set', ['m2:Mix:2#set','Orig7#set',-2], {param_in: ['Orig8']});
	t.equals(a.x_id, 'Orig8', 'Post-setter #7');
	chkr.check(a.x, ['m2:Mix:2','Orig8',-2]);


	// B sees A's wrappers
	let b = new B();
	chkr.check(b.x, ['m2:Mix:2','Orig1',-2]);

	// After wrapping B, it still sees A's wrappers
	libWrapper.register('m1', 'B.prototype.x', chkr.gen_wr('m1:Mix:3'));
	chkr.check(b.x, ['m1:Mix:3','m2:Mix:2','Orig1',-3]);

	// Now wrap B's setter
	libWrapper.register('m1', 'B.prototype.x#set', chkr.gen_wr('m1:Mix:3#set'));

	b.x = 'Orig9';
	chkr.check('m1:Mix:3#set', ['m1:Mix:3#set','m2:Mix:2#set','Orig1#set',-3], {param_in: ['Orig9']});
	t.equals(b.x_id, 'Orig9', 'Post-setter #8');
	chkr.check(b.x, ['m1:Mix:3','m2:Mix:2','Orig9',-3]);

	// Now wrap A and see if B sees the change
	libWrapper.register('m1', 'A.prototype.x', chkr.gen_wr('m1:Mix:4'));
	chkr.check(b.x, ['m1:Mix:3','m1:Mix:4', 'm2:Mix:2','Orig9',-4]);

	libWrapper.register('m1', 'A.prototype.x#set', chkr.gen_wr('m1:Mix:4#set'));
	b.x = 'Orig10';
	chkr.check('m1:Mix:3#set', ['m1:Mix:3#set','m1:Mix:4#set','m2:Mix:2#set','Orig9#set',-4], {param_in: ['Orig10']});
	t.equals(b.x_id, 'Orig10', 'Post-setter #9');
	chkr.check(b.x, ['m1:Mix:3','m1:Mix:4', 'm2:Mix:2','Orig10',-4]);



	// Done
	t.end();
});



// Modify wrapper after chaining asynchronously, before Promise resolves
test('Wrapper: Modify wrapper after chaining asynchronously, before Promise resolves', async function(t) {
	setup();
	const chkr = new CallOrderChecker(t);
	chkr.is_async = true;


	// Define class
	class A {};
	A.prototype.x = chkr.gen_rt('Orig');
	globalThis.A = A;


	// Instantiate A
	let a = new A();
	await chkr.call(a, 'x', ['Orig',-1], {title: 'a.Orig'});

	// Create wrappers
	game.add_module('m1');
	libWrapper.register('m1', 'A.prototype.x', chkr.gen_wr('1'));

	game.add_module('m2');
	libWrapper.register('m2', 'A.prototype.x', chkr.gen_fn('2',
		(frm, chain) => sync_async_then(chain(), v => chain())
	), 'WRAPPER');
	await chkr.call(a, 'x', ['2','1','Orig',-2,'1','Orig',-3], {title: 'a.1'});

	// Modify before `awaiting`
	const promise = chkr.call(a, 'x', ['2','1','Orig',-2,'1','Orig',-3], {title: 'a.2'});;
	libWrapper.unregister('m1', 'A.prototype.x');
	await promise;

	// Confirm it was unregistered
	await chkr.call(a, 'x', ['2','Orig',-1,'Orig',-2], {title: 'a.2 #2'});

	// Done
	t.end();
});