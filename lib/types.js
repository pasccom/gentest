"use strict";

(function() {
    var parentObject = window;
    if (typeof GenTest != 'undefined')
        parentObject = GenTest;
    else if (typeof module != 'undefined')
        parentObject = {
            RoseTree: require('./RoseTree'),
            errors: require('./errors'),
            shrink: require('./shrink'),
        };

    var errors = parentObject.errors;
    if (errors === undefined) {
        errors = {
            GentestError: GentestError,
            FailTestError: FailureError,
        };
    }

    // Basic generators and functions to combine them.

    parentObject.types = {};

    // Returns a generator that ignores size and generates
    // always the same value as provided.
    parentObject.types.constantly = function(x) {
        return function(_rng, _size) {
            return new parentObject.RoseTree(x);
        };
    };

    // Returns a generator that generates integers from low to high,
    // inclusive, shrinking towards center, if provided.
    // If low  is null, takes (center - size)
    // If high is null, takes (center  + size)
    // Otherwise size is ignored
    parentObject.types.choose = function(low, high, center) {
        if (arguments.length < 3) {
            if (low !== null)
                center = low;
            else if (high !== null)
                center = high;
            else
                center = 0;
        }

        return function(rng, size) {
            var l = (low !== null)  ? low  : center - size;
            var h = (high !== null) ? high : center  + size;

            var n = Math.floor(rng.float() * (h - l + 1) + l);
            return new parentObject.RoseTree(n, function() {
                return parentObject.shrink.int(n, center);
            });
        };
    };

    // Returns a generator that generates floating-point numbers
    // from low (inclusive) to high (exclusive),
    // shrinking towards center, if provided.
    // If low  is null, takes (center - size)
    // If high is null, takes (center  + size)
    // Otherwise size is ignored
    parentObject.types.float = function(low, high, center) {
        if (arguments.length < 3) {
            if (low !== null)
                center = low;
            else if (high !== null)
                center = high;
            else
                center = 0;
        }

        return function(rng, size) {
            var l = (low !== null)  ? low  : center - size;
            var h = (high !== null) ? high : center  + size;

            var n = rng.float() * (h - l) + l;
            return new parentObject.RoseTree(n, function() {
                return parentObject.shrink.float(n, center);
            });
        };
    };

    // (a -> b) -> Gen a -> Gen b
    // or
    // (a -> b) -> (PRNG -> Int -> RoseTree a) -> (PRNG -> Int -> RoseTree b)
    parentObject.types.fmap = function(fun, gen) {
        return function(rng, size) {
            return gen(rng, size).map(fun);
        };
    };

    // Gen a -> (a -> Gen b) -> Gen b
    // or
    // (PRNG -> Int -> RoseTree a)
    //  -> (a -> (PRNG -> Int -> RoseTree b))
    //  -> (PRNG -> Int -> RoseTree b)
    parentObject.types.bind = function(gen, fun) {
        return function(rng, size) {
                return gen(rng, size).flatmap(function(value) {
                return fun(value)(rng, size);
            });
        };
    };

    // Constrains generator:
    parentObject.types.suchThat = function(pred, gen, maxTries) {
        if (arguments.length < 3) maxTries = 10;

        return function(rng, size) {
            var triesLeft = maxTries;
            var tree;

            do {
                tree = gen(rng, size);
                if (pred(tree.root)) {
                    return tree.filterSubtrees(pred);
                }
            } while(--triesLeft > 0);

            throw new errors.GentestError('suchThat: could not find a suitable value');
        };
    };

    // Generator taking one of the elements of the given array of generators:
    parentObject.types.oneOf = function(gens) {
        if (gens.length < 1) {
            throw new errors.GentestError('Empty array passed to oneOf');
        }
        if (gens.length === 1) {
            return gens[0];
        }
        return parentObject.types.bind(parentObject.types.choose(0, gens.length-1), function(genIndex) {
            return gens[genIndex];
        });
    };

    // Generator taking an element of the given array:
    parentObject.types.elementOf = function(elems) {
        if (elems.length < 1) {
            throw new errors.GentestError('Empty array passed to elements');
        }
        return parentObject.types.oneOf(elems.map(parentObject.types.constantly));
    };

/*** BOOLEAN GENERATORS ******************************************************/

    // Boolean value generator:
    parentObject.types.bool = parentObject.types.elementOf([false, true]);

/*** INTEGERS GENERATORS *****************************************************/

    // Signed integer generator:
    parentObject.types.int = parentObject.types.choose(null, null);
    parentObject.types.int.nonZero = parentObject.types.suchThat(() => {x !== 0}, parentObject.types.int);
    parentObject.types.int.positive = parentObject.types.choose(1, null);
    parentObject.types.int.negative = parentObject.types.choose(null, -1);
    parentObject.types.int.nonNegative = parentObject.types.choose(0, null);
    parentObject.types.int.nonPositive = parentObject.types.choose(null, 0);

/*** CHARACTERS GENERATORS ***************************************************/
    // FIXME: This should eventually generate non-ASCII characters, I guess.
    parentObject.types.char = parentObject.types.fmap((n) => String.fromCharCode(n), parentObject.types.choose(32, 126));
    parentObject.types.char.numeric = parentObject.types.elementOf('0123456789'.split());
    parentObject.types.char.lowercase = parentObject.types.elementOf('abcdefghijklmnopqrstuvwxyz'.split());
    parentObject.types.char.uppercase = parentObject.types.elementOf('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split());
    parentObject.types.char.alpha = parentObject.types.elementOf('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split());
    parentObject.types.char.alphanumeric = parentObject.types.elementOf('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split());

    parentObject.types.date = function(format) {
        return parentObject.types.fmap(function(timestamp) {
            var date = new Date(timestamp);
            if (format === undefined)
                return date;
            var dateStr = '';
            var tok;

            for (var c = 0; c < format.length; c++) {
                if ((format[c] != '%') || (c + 1 == format.length)) {
                    dateStr += format[c];
                    continue;
                }
                c++;
                switch (format[c]) {
                    case 'd':
                        tok = '' + date.getDate() + '';
                        while (tok.length < 2)
                            tok = '0' + tok;
                        break;
                    case 'm':
                        tok = '' + (date.getMonth() + 1) + '';
                        while (tok.length < 2)
                            tok = '0' + tok;
                        break;
                    case 'Y':
                        tok = '' + date.getFullYear() + '';
                        while (tok.length < 4)
                            tok = '0' + tok;
                        break;
                    case 'H':
                        tok = '' + date.getDate() + '';
                        while (tok.length < 2)
                            tok = '0' + tok;
                        break;
                    case 'M':
                        tok = '' + date.getDate() + '';
                        while (tok.length < 2)
                            tok = '0' + tok;
                        break;
                    case 'S':
                        tok = '' + date.getDate() + '';
                        while (tok.length < 2)
                            tok = '0' + tok;
                        break;
                }
                dateStr += tok;
            }


            //console.log(timestamp, date, dateStr);
            return dateStr;
        }, parentObject.types.choose(null, null, Date.now()));
    };


/*** ARRAY GENERATORS ********************************************************/

    // Array generators:
    parentObject.types.arrayOf = function(elemGen, minLength, maxLength) {
        return function(rng, size) {
            if (!minLength)
                minLength = 0;
            if (maxLength === undefined)
                maxLength = null;

            var len = parentObject.types.choose(minLength, maxLength);
            len = len(rng, size).root;

            var elemTrees = new Array(len);
            for (var i = 0; i < len; i++) {
                elemTrees[i] = elemGen(rng, size);
            }

            return new parentObject.RoseTree(elemTrees.map(function(tree) { return tree.root; }), function() {
                return parentObject.shrink.array(elemTrees, minLength);
            });
        };
    };

    // Tuple generator:
    parentObject.types.tuple = function(gens) {
        var len = gens.length;
        return function(rng, size) {
            var elemTrees = new Array(len);
            for (var i = 0; i < len; i++) {
                elemTrees[i] = gens[i](rng, size);
            }

            return new parentObject.RoseTree(elemTrees.map(function(tree) { return tree.root; }), function() {
                return parentObject.shrink.array(elemTrees, null);
            });
        };
    };

/*** STRING GENERATORS *******************************************************/

    // String generator:
    parentObject.types.string = parentObject.types.fmap((a) => a.join(''), parentObject.types.arrayOf(parentObject.types.char));
    parentObject.types.string.numeric = parentObject.types.fmap((a) => a.join(''), parentObject.types.arrayOf(parentObject.types.char.numeric));
    parentObject.types.string.lowercase = parentObject.types.fmap((a) => a.join(''), parentObject.types.arrayOf(parentObject.types.char.lowercase));
    parentObject.types.string.uppercase = parentObject.types.fmap((a) => a.join(''), parentObject.types.arrayOf(parentObject.types.char.uppercase));
    parentObject.types.string.alpha = parentObject.types.fmap((a) => a.join(''), parentObject.types.arrayOf(parentObject.types.char.alpha));
    parentObject.types.string.alphanumeric = parentObject.types.fmap((a) => a.join(''), parentObject.types.arrayOf(parentObject.types.char.alphanumeric));

/*** OBJECT GENERATOR ********************************************************/

    // Creates objects resembling the template `obj`, where each
    // value in `obj` is a type generator.
    parentObject.types.shape = function(obj) {
        var attributeNames = [];
        var gens = [];

        Object.keys(obj).forEach(function(key) {
            attributeNames.push(key);
            gens.push(obj[key]);
        });

        return parentObject.types.fmap(function(tuple) {
            var obj = {};
            for (var i = 0; i < tuple.length; i++) {
                obj[attributeNames[i]] = tuple[i];
            }
            return obj;
        }, parentObject.types.tuple(gens));
    };

    if (typeof module != 'undefined')
        module.exports = parentObject.types;
})();
