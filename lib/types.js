"use strict";

// Basic generators and functions to combine them.

try {
    RoseTree = require('./RoseTree');
    errors = require('./errors');
    shrink = require('./shrink');
} catch (e) {
    if (!(e instanceof ReferenceError))
        throw e;

    var errors = {
        GentestError: GentestError,
        FailTestError: FailureError,
    };
}

var types = {};

// Returns a generator that ignores size and generates integers
// from low to high, inclusive, shrinking towards center, if
// provided.
types.choose = function(low, high, center) {
  if (arguments.length < 3) {
    center = low;
  }

  return function(rng, _size) {
    var n = Math.floor(rng.float() * (high - low + 1) + low);
    return new RoseTree(
      n,
      function() { return shrink.int(n, center); }
    );
  };
};

types.int = function(rng, size) {
  return types.choose(-size, size, 0)(rng, size);
};

types.int.nonNegative = function(rng, size) {
  return types.choose(0, size)(rng, size);
};

types.int.positive = function(rng, size) {
  return types.choose(1, size + 1)(rng, size);
};

types.suchThat = function(pred, gen, maxTries) {
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

function isNonzero(x) {
  return x !== 0;
}

types.int.nonZero = types.suchThat(isNonzero, types.int);

// FIXME: This should eventually generate non-ASCII characters, I guess.
types.char = function(rng, _size) {
  return types.choose(32, 126)(rng, _size).map(function(n) {
    return String.fromCharCode(n);
  });
};

types.arrayOf = function(elemGen) {
  return function(rng, size) {
    var len = types.int.nonNegative(rng, size).root;

    var elemTrees = new Array(len);
    for (var i = 0; i < len; i++) {
      elemTrees[i] = elemGen(rng, size);
    }

    return new RoseTree(
      elemTrees.map(function(tree) { return tree.root; }),
      function() {
        return shrink.array(elemTrees, true);
      }
    );
  };
};

types.tuple = function(gens) {
  var len = gens.length;
  return function(rng, size) {
    var elemTrees = new Array(len);
    for (var i = 0; i < len; i++) {
      elemTrees[i] = gens[i](rng, size);
    }

    return new RoseTree(
      elemTrees.map(function(tree) { return tree.root; }),
      function() {
        return shrink.array(elemTrees, false);
      }
    );
  };
};

// (a -> b) -> Gen a -> Gen b
// or
// (a -> b) -> (PRNG -> Int -> RoseTree a) -> (PRNG -> Int -> RoseTree b)
types.fmap = function(fun, gen) {
  return function(rng, size) {
    return gen(rng, size).map(fun);
  };
};

// Gen a -> (a -> Gen b) -> Gen b
// or
// (PRNG -> Int -> RoseTree a)
//  -> (a -> (PRNG -> Int -> RoseTree b))
//  -> (PRNG -> Int -> RoseTree b)
types.bind = function(gen, fun) {
  return function(rng, size) {
    return gen(rng, size).flatmap(function(value) {
      return fun(value)(rng, size);
    });
  };
};

types.string = types.fmap(function(chars) {
  return chars.join('');
}, types.arrayOf(types.char));

types.constantly = function(x) {
  return function(_rng, _size) {
    return new RoseTree(x);
  };
};

types.oneOf = function(gens) {
  if (gens.length < 1) {
    throw new errors.GentestError('Empty array passed to oneOf');
  }
  if (gens.length === 1) {
    return gens[0];
  }
  return types.bind(
    types.choose(0, gens.length-1),
    function(genIndex) {
      return gens[genIndex];
    }
  );
};

types.elements = function(elems) {
  if (elems.length < 1) {
    throw new errors.GentestError('Empty array passed to elements');
  }
  return types.oneOf(elems.map(types.constantly));
};

types.bool = types.elements([false, true]);

// Creates objects resembling the template `obj`, where each
// value in `obj` is a type generator.
types.shape = function(obj) {
  var attributeNames = [];
  var gens = [];

  Object.keys(obj).forEach(function(key) {
    attributeNames.push(key);
    gens.push(obj[key]);
  });

  var shapeify = function(tuple) {
    var obj = {};
    for (var i = 0; i < tuple.length; i++) {
      obj[attributeNames[i]] = tuple[i];
    }
    return obj;
  };

  return types.fmap(shapeify, types.tuple(gens));
};

try {
    module.exports = types;
} catch (e) {
    if (!(e instanceof ReferenceError))
        throw e;
}
