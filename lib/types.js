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
    // If low  is null, takes (high - size)
    // If high is null, takes (low  + size)
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
            var l = (low !== null)  ? low  : high - size;
            var h = (high !== null) ? high : low  + size;

            var n = Math.floor(rng.float() * (h - l + 1) + l);
            return new parentObject.RoseTree(n, function() {
                return parentObject.shrink.int(n, center);
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
    parentObject.types.elements = function(elems) {
        if (elems.length < 1) {
            throw new errors.GentestError('Empty array passed to elements');
        }
        return parentObject.types.oneOf(elems.map(parentObject.types.constantly));
    };

/*** BOOLEAN GENERATORS ******************************************************/

    // Boolean value generator:
    parentObject.types.bool = parentObject.types.elements([false, true]);

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
    parentObject.types.char.numeric = parentObject.types.elements('0123456789'.split());
    parentObject.types.char.lowercase = parentObject.types.elements('abcdefghijklmnopqrstuvwxyz'.split());
    parentObject.types.char.uppercase = parentObject.types.elements('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split());
    parentObject.types.char.alpha = parentObject.types.elements('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split());
    parentObject.types.char.alphanumeric = parentObject.types.elements('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split());

/*** ARRAY GENERATORS ********************************************************/

    // Array generator:
    parentObject.types.arrayOf = function(elemGen) {
        return function(rng, size) {
            var len = parentObject.types.int.nonNegative(rng, size).root;

            var elemTrees = new Array(len);
            for (var i = 0; i < len; i++) {
                elemTrees[i] = elemGen(rng, size);
            }

            return new parentObject.RoseTree(elemTrees.map(function(tree) { return tree.root; }), function() {
                return parentObject.shrink.array(elemTrees, true);
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
                return parentObject.shrink.array(elemTrees, false);
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
