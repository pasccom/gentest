"use strict";

(function() {
    var parentObject = window;
    if (typeof GenTest != 'undefined')
        parentObject = GenTest.errors = {};
    else if (typeof exports != 'undefined')
        parentObject = exports;

    // Subclass Error:
    parentObject.ErrorSubclass = function ErrorSubclass() {};
    parentObject.ErrorSubclass.prototype = Error.prototype;

    // Error from GenTest:
    parentObject.GentestError = function GentestError() {
    if (!this instanceof parentObject.GentestError) {
        throw new TypeError('GentestError must be called via new');
    }
    var tmp = Error.prototype.constructor.apply(this, arguments);
    if (tmp.stack) {
        this.stack = tmp.stack.replace(/^Error/, 'GentestError');
    }
    if (tmp.message) {
        this.message = tmp.message;
    }
    this.name = 'GentestError';
    return this;
    };
    parentObject.GentestError.prototype = new parentObject.ErrorSubclass();
    parentObject.GentestError.prototype.constructor = parentObject.GentestError;

    // Test case failure error:
    parentObject.FailureError = function FailureError() {
    parentObject.GentestError.prototype.constructor.apply(this, arguments);
    if (this.stack) {
        this.stack = this.stack.replace(/^GentestError/, 'FailureError');
    }
    this.name = 'FailureError';
    };
    parentObject.FailureError.prototype = new parentObject.GentestError();
    parentObject.FailureError.prototype.constructor = parentObject.FailureError;
})();
