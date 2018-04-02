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

        // Basic random number generator:
        var rng = {
            float: function() {
                return Math.random();
            }
        };

        // Saves arguments into variables and create generative testing spec:
        var fun = arguments[2];
        var genDesc = arguments[0];
        var genTypes = arguments[1];
        var genSpec = it(genDesc, genFun);
        return genSpec;

        // Genetive testing function (the function called by the spec):
        function genFun() {
            var results = []; // Array of (failed and passed) expectations results

            // Wrapper around fun to comply with generative testing (the function called by generative tester):
            var testFun = function() {
                results = [];
                try {
                    fun.apply(null, arguments);
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
                    throw e;
                }
                return results.map((r) => r.passed).reduce((a, p) => a && p, true);
            };

            // Alter spec so that expectations are added only after generative testing is done
            // and exceptions in this function yield a spec failure
            var specAddExpectationResult = genSpec.addExpectationResult.bind(genSpec);
            genSpec.onException = function(e) {
                // Add expectation results to spec:
                results.forEach(function(r) {
                    specAddExpectationResult(r.passed, r, r.error === undefined);
                });
                // Add GenTest error to spec:
                specAddExpectationResult(false, {
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

            // The property to test and the current test case:
            var prop = new GenTest.Property(testFun, genDesc, Array.isArray(genTypes) ? GenTest.types.tuple(genTypes) : genTypes);

            // Run generative testing tests
            var testCase;
            var ans;
            for (k = 0; k < GenTest.options.numTests; k++) {
                testCase = prop.genTest(rng, GenTest.options.maxSize * (k + 1) / GenTest.options.numTests);
                ans = prop.runTest(testCase);

                if (!ans.success)
                    break;
            }

            // Shrink failing testcase
            if (!ans.success && GenTest.options.shriking) {
                var iter = prop.shrinkFailingTest(testCase); // Test case tree iterator
                var lastFailedResults = results;             // Result of last failed expectation

                // GC unused branches of the tree
                testCase = null;

                var numAttempts = 0; // Number of tries done
                var numShrinks = 0;  // Number of shrinks done

                // Test case tree shriking
                var ret = iter.next();
                while ((numAttempts < GenTest.options.maxShrinkAttempts) && !ret.done) {
                    var value = ret.value;
                    numAttempts++;
                    if (!value.result.success) {
                        results.forEach(function(r) {
                            if (!r.passed && r.message)
                                r.message = r.message + ' Arguments: (' + value.testArgs + ')';
                        });
                        lastFailedResults = results;
                        numShrinks++;
                    }
                    console.log('Shrinking ' + numShrinks + '/' + numAttempts);
                    ret = iter.next();
                }

                // Put expectation results of last failed case in test results
                results = lastFailedResults;
            }

            // Add test results to spec
            results.forEach(function(r) {
                specAddExpectationResult(r.passed, r, r.error === undefined);
            });
        }
    }
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
