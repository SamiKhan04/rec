# tree = {}
# def trace(fn):
#     def wrapper(*args, **kwargs):
#       parent = wrapper.call
#       wrapper.call += 1
#       result = fn(*args, **kwargs)
#       tree[wrapper.call] = (parent, args, result)
#       return result
#     wrapper.call = 0
#     return wrapper



# @trace
# def fib(n):
#   if n == 0 or n == 1:
#       return n
#   return fib(n-1) + fib(n-2)

tree = {}
def trace(tree_dict):
    def deco(fn):
        next_id = 0
        stack = []  # holds node ids of the active call chain

        def wrapper(*args, **kwargs):
            nonlocal next_id, stack
            my_id = next_id; next_id += 1
            parent = stack[-1] if stack else None

            stack.append(my_id)
            try:
                result = fn(*args, **kwargs)
                tree_dict[my_id] = (parent, args, kwargs, result)
                return result
            finally:
                stack.pop()
        return wrapper
    return deco

@trace(tree)
def fib(n):
  if n == 0 or n == 1:
      return n
  return fib(n-1) + fib(n-2)

from collections import defaultdict

def _build_children(tree: dict[int, tuple]):
    """
    Build adjacency from your {id: (parent, args, kwargs, ret)} mapping.
    Returns (children, roots) where:
      children[parent_id] = [child_id, ...]  (in insertion order)
      roots = [id, ...]  (nodes whose parent is None)
    """
    children = defaultdict(list)
    roots = []
    for nid, (par, *_rest) in tree.items():
        if par is None:
            roots.append(nid)
        children[par].append(nid)
    return children, roots

def dfs(tree: dict[int, tuple], start: int | None = None, visit=lambda nid, node, depth: None):
    """
    Depth-first traversal over your call tree.
      - If `start` is None, it traverses all roots (in creation order).
      - `visit(nid, node, depth)` is called pre-order for each node.
    """
    children, roots = _build_children(tree)

    def _walk(nid: int, depth: int):
        node = tree[nid]  # (parent, args, kwargs, ret)
        visit(nid, node, depth)
        for c in children.get(nid, []):
            _walk(c, depth + 1)

    if start is None:
        for r in roots:
            _walk(r, 0)
    else:
        _walk(start, 0)

# ------------------------------
# Pretty ASCII text visualization
# ------------------------------

def print_ascii_tree(tree: dict[int, tuple], label_fn=None):
    """
    Prints an ASCII tree using box-drawing characters.

    label_fn: optional callable (nid, node_tuple) -> str
              Defaults to 'fib(args) -> ret' style label.
    """
    children, roots = _build_children(tree)

    def default_label(nid, node):
        _par, args, kwargs, ret = node
        if kwargs:
            return f"#{nid}({', '.join(map(repr, args))}, **{kwargs}) -> {ret!r}"
        else:
            return f"#{nid}({', '.join(map(repr, args))}) -> {ret!r}"

    if label_fn is None:
        label_fn = default_label

    def _recurse(nid: int, prefix: str, is_last: bool):
        node = tree[nid]
        connector = "└── " if is_last else "├── "
        print(prefix + connector + label_fn(nid, node))
        kids = children.get(nid, [])
        # Prefix for children: if current is last, spaces; else, vertical bar
        child_prefix = prefix + ("    " if is_last else "│   ")
        for i, c in enumerate(kids):
            _recurse(c, child_prefix, i == len(kids) - 1)

    # If multiple roots (e.g., you traced multiple top-level calls), print each.
    for r_i, r in enumerate(roots):
        print(label_fn(r, tree[r]))
        kids = children.get(r, [])
        for i, c in enumerate(kids):
            _recurse(c, "", i == len(kids) - 1)
        if r_i != len(roots) - 1:
            print()  # blank line between root components

# ------------------------------
# Minimal indent-only variant (no box chars)
# ------------------------------

def print_indented(tree: dict[int, tuple]):
    """
    Simpler, space-indented view: each level indented by two spaces.
    """
    children, roots = _build_children(tree)
    def _walk(nid: int, depth: int):
        _par, args, kwargs, ret = tree[nid]
        args_s = ", ".join(map(repr, args))
        kw_s = (", **" + repr(kwargs)) if kwargs else ""
        print("  " * depth + f"#{nid}({args_s}{kw_s}) -> {ret!r}")
        for c in children.get(nid, []):
            _walk(c, depth + 1)
    for r in roots:
        _walk(r, 0)
