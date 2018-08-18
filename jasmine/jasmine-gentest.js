"use strict";

var GenTest = {};

// GenTest options
GenTest.options = {
    maxSize:           100,
    numTests:           10,
    shriking:         true,
    maxShrinkAttempts: 100,
};

// Wrap generative tester into spec:
GenTest.wrap = function(it) {
    // The new spec function (takes two or three arguments):
    return function(/* desc, [types,] fun*/) {
        // If two arguments are passed, call original function
        if (arguments.length == 2) {
            return it(arguments[0], arguments[1]);
        }

        // Saves arguments into variables and create generative testing spec:
        var fun = arguments[2];
        var genDesc = arguments[0];
        var genTypes = arguments[1];
        var genSpec = it(genDesc, genFun);
        return genSpec;

        // Generative testing function (the function called by the spec):
        // @params jasmineDone This function should be called when we are done running the tests.
        function genFun(jasmineDone) {
            // Alter spec so that expectations are added only after generative testing is done
            // and exceptions in this function yield a spec failure
            var specAddExpectationResult = genSpec.addExpectationResult;
            var specOnExpection = genSpec.onException;

            genSpec.onException = function(e) {
                // Add GenTest error to spec:
                genSpec.addExpectationResult(false, {
                    matcherName: '',
                    passed: false,
                    expected: '',
                    actual: '',
                    error: e,
                    message: 'GenTest Error: ' + e.toString() + ' (' + e.fileName + ' at ' + e.lineNumber + ':' + e.columnNumber + ').',
                }, true);
            };
            genSpec.addExpectationResult = function(passed, data, isError) {
                results.push(data);

                if (genSpec.throwOnExpectationFailure && !passed && !isError)
                    throw new jasmine.errors.ExpectationFailed();
            };

            var results = []; // Array of (failed and passed) expectations results
            function saveResults() {
                var currentResults = arguments.length < 1 ? results : arguments[0];

                currentResults.forEach((r) => {
                    specAddExpectationResult.call(genSpec, r.passed, r, r.error === undefined);
                });
            }

            // Wrapper around fun to comply with generative testing (the function called by generative tester):
            // @param ...args Arguments to be passed to the test function
            // @param genTestDone function to be called when test is finished
            var testFun = function() {
                var args = Array.prototype.slice.call(arguments, 0, arguments.length - 1);
                var genTestDone = arguments[arguments.length - 1];

                var done = false;
                var checkResults = function() {
                    if (done)
                        return;
                    done = true;

                    if (results.map((r) => r.passed).reduce((a, p) => a && p, true))
                        genTestDone();
                    else
                        genTestDone.fail();
                };
                checkResults.fail = function(error) {
                    if (done)
                        console.warn('This function should be called only once');
                    done = true;

                    var msg = 'Failed';
                    if (error) {
                        msg += ': ';
                        if (error.message)
                            msg += error.message;
                        else
                            msg += jasmine.pp(error);
                    }

                    genSpec.addExpectationResult(false, {
                        matcherName: '',
                        passed: false,
                        expected: '',
                        actual: '',
                        message: msg,
                        error: error && error.message ? error : null
                    }, error && error.message);

                    genTestDone.fail();
                };

                results = [];

                try {
                    if (fun.length == args.length) {
                        var maybePromise = fun.apply(null, args);
                        if (maybePromise && (Object.prototype.toString.apply(maybePromise.then) == '[object Function]'))
                            maybePromise.then(checkResults, checkResults.fail);
                        else
                            checkResults();
                    } else {
                        fun.apply(null, args.concat(checkResults));
                    }
                } catch (e) {
                    if (!(e instanceof jasmine.errors.ExpectationFailed))
                        results.push({
                            matcherName: '',
                            passed: false,
                            expected: '',
                            actual: '',
                            error: e,
                            message: e.toString() + ' (' + e.fileName + ' at ' + e.lineNumber + ':' + e.columnNumber + ').',
                        });
                    checkResults.fail(e);
                }
            };

            // Cleanup when all tests are done:
            var cleanup = function(success, results) {
                saveResults(results);
                if (success)
                    jasmineDone();
                else
                    jasmineDone.fail();
            };

            // The property to test and the current test case:
            var prop = new GenTest.Property(testFun, genDesc, Array.isArray(genTypes) ? GenTest.types.tuple(genTypes) : genTypes);
            prop.runTests(function() {
                // Success
                cleanup(true, results);
            }, function(testCase) { // TODO testCase -> props
                // Failure (shrink testcase if asked)
                if (!GenTest.options.shriking) {
                    cleanup(false, results);
                } else {
                    var iter = prop.shrinkFailingTest(testCase); // Test case tree iterator
                    var lastFailedResults = results;             // Result of last failed expectation
                    testCase = null;                             // GC unused branches of the tree

                    var checkResult = function(success, testArgs) {
                        if (!success) {
                            results.forEach(function(r) {
                                if (!r.passed && r.message)
                                    r.message = r.message + ' Arguments: (' + testArgs + ')';
                            });

                            lastFailedResults = results;
                        }

                        next();
                    };

                    var next = function() {
                        var ret = iter.next();
                        if (!ret.done) {
                            ret.value(checkResult);
                        } else {
                            console.log('Done: ' + ret.reason);
                            cleanup(false, lastFailedResults);
                        }
                    };
                    next();
                }
            });
        }
    };
}

if (!describe)
    throw new ReferenceError('GenTest wrapper for Jasmine "jasmine-gentest.js" must be loaded after Jasmine itself');

// Wrap generative testing in it, fit and xit:
if (it)
    it = GenTest.wrap(it);
if (fit)
    fit = GenTest.wrap(fit);
if (xit)
    xit = GenTest.wrap(xit);
