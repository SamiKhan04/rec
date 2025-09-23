export const TRACER_PY = `from collections import defaultdict


tree = {}

def trace(tree_dict):
    def deco(fn):
        next_id = 0
        stack = []  # holds node ids of the active call chain

        def wrapper(*args, **kwargs):
            nonlocal next_id, stack
            my_id = next_id
            next_id += 1
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


def _build_children(tree: dict[int, tuple]):
    """Build adjacency from {id: (parent, args, kwargs, ret)} mapping."""
    children = defaultdict(list)
    roots = []
    for nid, (par, *_rest) in tree.items():
        if par is None:
            roots.append(nid)
        children[par].append(nid)
    return children, roots


def dfs(tree: dict[int, tuple], start: int | None = None, visit=lambda nid, node, depth: None):
    """Depth-first traversal over the call tree."""
    children, roots = _build_children(tree)

    def _walk(nid: int, depth: int):
        node = tree[nid]
        visit(nid, node, depth)
        for c in children.get(nid, []):
            _walk(c, depth + 1)

    if start is None:
        for r in roots:
            _walk(r, 0)
    else:
        _walk(start, 0)


def print_ascii_tree(tree: dict[int, tuple], label_fn=None):
    """Print an ASCII tree using box-drawing characters."""
    children, roots = _build_children(tree)

    def default_label(nid, node):
        _par, args, kwargs, ret = node
        if kwargs:
            return f"#{nid}({', '.join(map(repr, args))}, **{kwargs}) -> {ret!r}"
        return f"#{nid}({', '.join(map(repr, args))}) -> {ret!r}"

    if label_fn is None:
        label_fn = default_label

    def _recurse(nid: int, prefix: str, is_last: bool):
        node = tree[nid]
        connector = "└── " if is_last else "├── "
        print(prefix + connector + label_fn(nid, node))
        kids = children.get(nid, [])
        child_prefix = prefix + ("    " if is_last else "│   ")
        for i, c in enumerate(kids):
            _recurse(c, child_prefix, i == len(kids) - 1)

    for r_i, r in enumerate(roots):
        print(label_fn(r, tree[r]))
        kids = children.get(r, [])
        for i, c in enumerate(kids):
            _recurse(c, "", i == len(kids) - 1)
        if r_i != len(roots) - 1:
            print()


def print_indented(tree: dict[int, tuple]):
    """Simpler, space-indented view of the call tree."""
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
`;
