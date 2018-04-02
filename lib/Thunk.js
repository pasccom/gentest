"use strict";

// A small wrapper for thunks that caches the realized value.
//
// Public API:
//  .get(): Forces evaluation and returns the value.

(function() {
    var parentObject = window;
    if (typeof GenTest != 'undefined')
        parentObject = GenTest;
    else if (typeof module != 'undefined')
        parentObject = {};

    // Thunk constructor:
    parentObject.Thunk = function(f) {
        if (!(this instanceof parentObject.Thunk)) {
            return new parentObject.Thunk(f);
        }

        this._f = f;
        this._realized = false;
        return this;
    };

    // Thunk prototype:
    parentObject.Thunk.prototype = {
        get: function() {
            if (!this._realized) {
                this._value = this._f();
                this._realized = true;
                this._f = null;  // Allow closure to be garbage-collected.
            }
            return this._value;
        }
    };

    if (typeof module != 'undefined')
        module.exports = parentObject.Thunk;
})();
