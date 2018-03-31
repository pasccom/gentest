function gentest(it) {
    return function(/* desc, [types,] fun*/) {
        var desc = arguments[0];
        
        // Call original function:
        if (arguments.length == 2) {
            return it(desc, arguments[1]);
        }
        
        // Generated testing:
        var fun = arguments[2];
        var genTypes = arguments[1];
        
        var rng = {
            float: function() {
                return Math.random();
            }
        }
        
        var genSpec = it(desc, genFun);
        return genSpec;
        
        function genFun() {
            var result;
            var specAddExpectationResult = genSpec.addExpectationResult.bind(genSpec);
            genSpec.addExpectationResult = function(passed, data, isError) {
                result = data;
            };
            
            var testFun = function() {
                try {
                    fun.apply(null, arguments);
                } catch (e) {
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
            
            var prop = new Property(testFun, desc, types.tuple(genTypes));
            var testCase;
            
            // TODO Should be options:
            var maxSize = 100;
            var numTests = 10;
            
            for (k = 0; k < numTests; k++) {
                testCase = prop.genTest(rng, maxSize * (k + 1) / numTests);
                prop.runTest(testCase);
                
                if (result.passed === false)
                    break;
            }
            
            if (result.passed === false) { // TODO Enable/disable shriking by option
                var iter = prop.shrinkFailingTest(testCase);
                var lastFailedResult = result;
                testCase = null;  // Allow GC of unused parts of the tree.
                
                var numAttempts = 0;
                var numShrinks = 0;

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
                
                result = lastFailedResult;
            }
            
            specAddExpectationResult(result.passed, result, result.error === undefined);
        }
    }
}

if (!describe)
    throw new ReferenceError('GenTest wrapper for Jasmine "jasmine-gentest.js" must be loaded after Jasmine itself');

if (it)
    it = gentest(it);
if (fit)
    fit = gentest(fit);
if (xit)
    xit = gentest(xit);
