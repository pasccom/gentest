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

    // Returns a generator that ignores size and generates integers
    // from low to high, inclusive, shrinking towards center, if
    // provided.
    parentObject.types.choose = function(low, high, center) {
        if (arguments.length < 3) {
            center = low;
        }

        return function(rng, _size) {
            var n = Math.floor(rng.float() * (high - low + 1) + low);
            return new parentObject.RoseTree(n, function() {
                return parentObject.shrink.int(n, center);
            });
        };
    };

    // Signed integer generator:
    parentObject.types.int = function(rng, size) {
        return parentObject.types.choose(-size, size, 0)(rng, size);
    };

    // Unsigned integer generator:
    parentObject.types.int.nonNegative = function(rng, size) {
        return parentObject.types.choose(0, size)(rng, size);
    };

    // Non-zero unsigned integer generator:
    parentObject.types.int.positive = function(rng, size) {
        return parentObject.types.choose(1, size + 1)(rng, size);
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

    // Non-zero integer generator:
    parentObject.types.int.nonZero = parentObject.types.suchThat(() => {x !== 0}, parentObject.types.int);

    // Characters generator:
    // FIXME: This should eventually generate non-ASCII characters, I guess.
    parentObject.types.char = function(rng, _size) {
        return parentObject.types.choose(32, 126)(rng, _size).map(function(n) {
            return String.fromCharCode(n);
        });
    };

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

    // String generator:
    parentObject.types.string = parentObject.types.fmap(function(chars) {
        return chars.join('');
    }, parentObject.types.arrayOf(parentObject.types.char));

    // Constant generator:
    parentObject.types.constantly = function(x) {
        return function(_rng, _size) {
            return new parentObject.RoseTree(x);
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

    // Boolean value generator:
    parentObject.types.bool = parentObject.types.elements([false, true]);

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
