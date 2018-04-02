"use strict";

(function() {
    var parentObject = window;
    if (typeof GenTest != 'undefined')
        parentObject = GenTest;
    else if (typeof module != 'undefined')
        parentObject = {
            Thunk: require('./Thunk'),
        };

    // Lazy rose trees and functions to operate on them.
    //
    // A rose tree consists of a value and an array of children,
    // all of which are themselves rose trees. To make them lazy,
    // the array of children is represented by a thunk.


    var emptyThunk = new parentObject.Thunk(function() { return []; });

    // Constructor. Takes root value and a zero-argument function
    // to call to produce the children. If childrenFunc is not
    // provided, the root has no children.
    // data RoseTree a = RoseTree a (RoseTree a)
    parentObject.RoseTree = function(root, childrenFunc) {
        if (!(this instanceof parentObject.RoseTree)) {
            return new parentObject.RoseTree(root, childrenFunc);
        }
        this.root = root;
        this._children = childrenFunc ? new parentObject.Thunk(childrenFunc) : emptyThunk;
    };

    // "Flatten" a tree one level. (Monadic join.)
    // RoseTree (RoseTree a) -> RoseTree a
    function flatten(tree) { // TODO put this function in RoseTree.prototype
        if (!(tree.root instanceof parentObject.RoseTree)) {
            throw new TypeError("Can't call flatten when elements aren't trees");
        }

        return new parentObject.RoseTree(tree.root.root, function() {
            var innerChildren = tree.root.children();
            var outerChildren = tree.children().map(flatten);
            return outerChildren.concat(innerChildren);
        });
    };

    // (a -> b) -> RoseTree a -> RoseTree b
    function fmap(f, tree) { // TODO put this function in RoseTree.prototype
        return new parentObject.RoseTree(f(tree.root), function() {
            return tree.children().map(fmap.bind(null, f));
        });
    };

    // RoseTree a -> (a -> Bool) -> RoseTree a
    function filterSubtrees(pred, tree) { // TODO put this function in RoseTree.prototype
        return new parentObject.RoseTree(tree.root, function() {
            return tree.children().filter(function(subtree) {
                return pred(subtree.root);
            }).map(filterSubtrees.bind(null, pred));
        });
    };

    parentObject.RoseTree.prototype = {
        // Returns the node's immediate children, realizing them if necessary.
        // RoseTree a -> [RoseTree a]
        children: function() {
            return this._children.get();
        },

        // Map a function over each element's value. This is fmap, but with
        // arguments reversed in keeping with the faux-OO method interface:
        // RoseTree a -> (a -> b) -> RoseTree b
        map: function(f) {
            return fmap(f, this);
        },

        // Monadic bind. Same as map but here the function is assumed to yield
        // a rose tree for each element. In Haskell, the type would be:
        // RoseTree a -> (a -> RoseTree b) -> RoseTree b
        // I didn't call this 'bind' to avoid confusion with Function#bind.
        flatmap: function(f) {
            return flatten(fmap(f, this));
        },

        // Filters out all descendants whose roots do not satisfy the predicate.
        // Does not check the root against the predicate.
        // RoseTree a -> (a -> Bool) -> RoseTree a
        filterSubtrees: function(pred) {
            return filterSubtrees(pred, this);
        }
    };

    if (typeof module != 'undefined')
        module.exports = parentObject.RoseTree;
})();
