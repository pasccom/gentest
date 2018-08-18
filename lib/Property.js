"use strict";

(function() {
    var parentObject = window;
    if (typeof GenTest != 'undefined')
        parentObject = GenTest;
    else if (typeof module != 'undefined')
        parentObject = {
            errors: require('./errors'),
            types: require('./types'),
        };

    var errors = parentObject.errors;
    if (errors === undefined) {
        errors = {
            GentestError: GentestError,
            FailTestError: FailureError,
        };
    }

    // Create properties from functions.

    parentObject.Property = function(func, name, gen) {
        if (!(this instanceof parentObject.Property)) {
            return new parentObject.Property(func, name, gen);
        }

        if (typeof func !== 'function' ||
            typeof name !== 'string' ||
            typeof gen !== 'function') {
            throw new errors.GentestError('Property constructor called with ' +
                                        'invalid arguments');
        }

        this._func = func;
        this.name = name;
        this._gen = gen;

        // Basic random number generator:
        this.rng = {
            float: function() {
                return Math.random();
            }
        };
    };

    // Generate a test case for the property.
    parentObject.Property.prototype.genTest = function(size) {
        if (typeof size !== 'number' || size < 1) {
            throw new errors.GentestError('size must be a positive integer');
        }
        size |= 0;
        return this._gen(this.rng, size);
    };

    parentObject.Property.prototype.runTests = function(success, failure) {
        var testCase;
        var k = 0;
        var self = this;

        var done = function() {
            next();
        };
        done.fail = function() {
            failure(testCase, ...arguments);
        };

        var next = function() {
            if (k < GenTest.options.numTests) {
                testCase = self.genTest(GenTest.options.maxSize * (++k) / GenTest.options.numTests);
                self.runTest(testCase, done);
            } else {
                success();
            }
        };

        next();
    };

    // Run a test case as returned from genTest.
    // Returns an object:
    // {
    //   success: [boolean],
    //   error: [if an uncaught exception was raised, the exception],
    // }
    parentObject.Property.prototype.runTest = function(testCase, done) {
        try {
            if (this._func.length == testCase.root.length) {
                var maybePromise = this._func.apply(null, testCase.root);
                if (maybePromise && (Object.prototype.toString.apply(maybePromise.then) == '[object Function]'))
                    maybePromise.then(done, done.fail);
                else
                    done();
            } else {
                this._func.apply(null, testCase.root.concat(done));
            }
        } catch(e) {
            done.fail(e);
        }
    };

    // Returns an iterator (compliant with the ES6 iterator protocol) over
    // shrunk versions of the failing `testCase`. This should be a test
    // case returned by `.genTest` and which has resulted in a `{success:
    // false}` return value from `.runTest`.
    //
    // Concretely, calling `.next()` on the returned iterator causes a
    // shrunk test case to be executed, if any remain to be tried. The
    // iterator will return something like:
    //
    // {
    //   done: false,
    //   value: {
    //     testArgs: [the arguments tested],
    //     result: [same as return value of .runTest()]
    //   }
    // }
    //
    // When the iterator finishes by returning `{done: true}`, the last
    // value it produced where `result.success === false` (or the original
    // `testCase`, if no such value was produced) should be considered the
    // minimum failing test case.
    //
    parentObject.Property.prototype.shrinkFailingTest = function(testCase) {
        // Implementation note: This would be clearer with coroutines (aka ES6
        // "generators" — unfortunate clash of terminology there). This function
        // basically fakes a coroutine, which requires explicitly keeping track
        // of the state between return values, namely:
        var node = testCase;  // The node whose children we are exploring.
        var childIndex = 0;   // The index of the child to explore next.
        var self = this;      // (constant) Reference to `this`.
        var numAttempts = 0; // Number of tries done    // TODO numAttempts -> Property
        var numShrinks = 0;  // Number of shrinks done  // TODO numShrinks -> Property

        return {
            next: function() {
                if (numAttempts++ > GenTest.options.maxShrinkAttempts)
                    return {
                        done: true,
                        reason: 'maxAttempts',
                    };
                if (childIndex >= node.children().length)
                    return {
                        done: true,
                        reason: 'shrunk',
                    };

                return {
                    done: false,
                    value: function(done) {
                        var checkResults = function() {
                            childIndex++;
                            done(true);
                        };
                        checkResults.fail = function() {
                            node = node.children()[childIndex];
                            childIndex = 0;
                            numShrinks++;
                            done(false, node.root);
                        };

                        console.log('Shrunk: ' + numShrinks + '/' + numAttempts);
                        self.runTest(node.children()[childIndex], checkResults);
                    },
                };
            },
        };
    };

    // Implement the forAll(args, name, func) sugar, returning a Property.
    parentObject.Property.forAll = function(args, name, func) {
        // `args` may be an array of generators (positional arguments to `func`),
        // or an object with generators as values (named members of a single
        // object passed to `func`). Either way, we give the Property constructor
        // a single generator that generates an array of arguments.
        var gen = Array.isArray(args) ? parentObject.types.tuple(args) : parentObject.types.tuple(parentObject.types.shape(args));

        return new parentObject.Property(func, name, gen);
    };

    if (typeof module != 'undefined')
        module.exports = parentObject.Property;
})();
