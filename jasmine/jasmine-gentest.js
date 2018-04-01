// Wrap generative tester into spec:
function gentest(it) {
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
            var result; // TODO there may be a problem here (multiple expectations)

            // Wrapper around fun to comply with generative testing (the function called by generative tester):
            var testFun = function() {
                try {
                    fun.apply(null, arguments);
                } catch (e) {
                    if (!(e instanceof jasmine.errors.ExpectationFailed))
                        result = {
                            matcherName: '',
                            passed: false,
                            expected: '',
                            actual: '',
                            error: e,
                            message: e.toString() + ' (' + e.fileName + ' at ' + e.lineNumber + ':' + e.columnNumber + ').',
                        };
                    throw e;
                }
                return result.passed;
            };

            // Alter spec so that expectations are added only after generative testing is done
            // and exceptions in this function yield a spec failure
            var specAddExpectationResult = genSpec.addExpectationResult.bind(genSpec);
            genSpec.onException = function(e) {
                specAddExpectationResult(false, {
                    matcherName: '',
                    passed: false,
                    expected: '',
                    actual: '',
                    error: e,
                    message: e.toString() + ' (' + e.fileName + ' at ' + e.lineNumber + ':' + e.columnNumber + ').',
                }, true);
            };
            genSpec.addExpectationResult = function(passed, data, isError) {
                result = data;

                if (genSpec.throwOnExpectationFailure && !passed && !isError)
                    throw new jasmine.errors.ExpectationFailed();
            };
            
            // The property to test and the current test case:
            var prop = new Property(testFun, genDesc, Array.isArray(genTypes) ? types.tuple(genTypes) : genTypes);
            var testCase;

            // TODO Should be options:
            var maxSize = 100;
            var numTests = 10;
            
            // Run generative testing tests
            for (k = 0; k < numTests; k++) {
                testCase = prop.genTest(rng, maxSize * (k + 1) / numTests);
                prop.runTest(testCase);
                
                if (result.passed === false)
                    break;
            }
            
            // Shrink failing testcase
            if (result.passed === false) { // TODO Enable/disable shriking by option
                var iter = prop.shrinkFailingTest(testCase); // Test case tree iterator
                var lastFailedResult = result;               // Result of last failed expectation

                // GC unused branches of the tree
                testCase = null;
                
                var numAttempts = 0; // Number of tries done   // TODO max attempts in option
                var numShrinks = 0;  // Number of shrinks done

                // Test case tree shriking
                var ret = iter.next();
                while (!ret.done) {
                    var value = ret.value;
                    numAttempts++;
                    if (!value.result.success) {
                        if (result.message)
                            result.message = result.message + ' Arguments: (' + value.testArgs + ')';
                        lastFailedResult = result;
                        numShrinks++;
                    }
                    console.log('Shrinking ' + numShrinks + '/' + numAttempts);
                    ret = iter.next();
                }
                
                // Put last failed expectation in test result
                result = lastFailedResult;
            }
            
            // Add test result to spec
            specAddExpectationResult(result.passed, result, result.error === undefined);
        }
    }
}

if (!describe)
    throw new ReferenceError('GenTest wrapper for Jasmine "jasmine-gentest.js" must be loaded after Jasmine itself');

// Wrap generative testing in it, fit and xit:
if (it)
    it = gentest(it);
if (fit)
    fit = gentest(fit);
if (xit)
    xit = gentest(xit);
