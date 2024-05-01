// Navigation 1 (copy) - Updated April 30, 2024
function noop() { }
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
let src_url_equal_anchor;
function src_url_equal(element_src, url) {
    if (!src_url_equal_anchor) {
        src_url_equal_anchor = document.createElement('a');
    }
    src_url_equal_anchor.href = url;
    return element_src === src_url_equal_anchor.href;
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}

// Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
// at the end of hydration without touching the remaining nodes.
let is_hydrating = false;
function start_hydrating() {
    is_hydrating = true;
}
function end_hydrating() {
    is_hydrating = false;
}
function upper_bound(low, high, key, value) {
    // Return first index of value larger than input value in the range [low, high)
    while (low < high) {
        const mid = low + ((high - low) >> 1);
        if (key(mid) <= value) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
}
function init_hydrate(target) {
    if (target.hydrate_init)
        return;
    target.hydrate_init = true;
    // We know that all children have claim_order values since the unclaimed have been detached if target is not <head>
    let children = target.childNodes;
    // If target is <head>, there may be children without claim_order
    if (target.nodeName === 'HEAD') {
        const myChildren = [];
        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            if (node.claim_order !== undefined) {
                myChildren.push(node);
            }
        }
        children = myChildren;
    }
    /*
    * Reorder claimed children optimally.
    * We can reorder claimed children optimally by finding the longest subsequence of
    * nodes that are already claimed in order and only moving the rest. The longest
    * subsequence of nodes that are claimed in order can be found by
    * computing the longest increasing subsequence of .claim_order values.
    *
    * This algorithm is optimal in generating the least amount of reorder operations
    * possible.
    *
    * Proof:
    * We know that, given a set of reordering operations, the nodes that do not move
    * always form an increasing subsequence, since they do not move among each other
    * meaning that they must be already ordered among each other. Thus, the maximal
    * set of nodes that do not move form a longest increasing subsequence.
    */
    // Compute longest increasing subsequence
    // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
    const m = new Int32Array(children.length + 1);
    // Predecessor indices + 1
    const p = new Int32Array(children.length);
    m[0] = -1;
    let longest = 0;
    for (let i = 0; i < children.length; i++) {
        const current = children[i].claim_order;
        // Find the largest subsequence length such that it ends in a value less than our current value
        // upper_bound returns first greater value, so we subtract one
        // with fast path for when we are on the current longest subsequence
        const seqLen = ((longest > 0 && children[m[longest]].claim_order <= current) ? longest + 1 : upper_bound(1, longest, idx => children[m[idx]].claim_order, current)) - 1;
        p[i] = m[seqLen] + 1;
        const newLen = seqLen + 1;
        // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
        m[newLen] = i;
        longest = Math.max(newLen, longest);
    }
    // The longest increasing subsequence of nodes (initially reversed)
    const lis = [];
    // The rest of the nodes, nodes that will be moved
    const toMove = [];
    let last = children.length - 1;
    for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
        lis.push(children[cur - 1]);
        for (; last >= cur; last--) {
            toMove.push(children[last]);
        }
        last--;
    }
    for (; last >= 0; last--) {
        toMove.push(children[last]);
    }
    lis.reverse();
    // We sort the nodes being moved to guarantee that their insertion order matches the claim order
    toMove.sort((a, b) => a.claim_order - b.claim_order);
    // Finally, we move the nodes
    for (let i = 0, j = 0; i < toMove.length; i++) {
        while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
            j++;
        }
        const anchor = j < lis.length ? lis[j] : null;
        target.insertBefore(toMove[i], anchor);
    }
}
function append_hydration(target, node) {
    if (is_hydrating) {
        init_hydrate(target);
        if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentNode !== target))) {
            target.actual_end_child = target.firstChild;
        }
        // Skip nodes of undefined ordering
        while ((target.actual_end_child !== null) && (target.actual_end_child.claim_order === undefined)) {
            target.actual_end_child = target.actual_end_child.nextSibling;
        }
        if (node !== target.actual_end_child) {
            // We only insert if the ordering of this node should be modified or the parent node is not target
            if (node.claim_order !== undefined || node.parentNode !== target) {
                target.insertBefore(node, target.actual_end_child);
            }
        }
        else {
            target.actual_end_child = node.nextSibling;
        }
    }
    else if (node.parentNode !== target || node.nextSibling !== null) {
        target.appendChild(node);
    }
}
function insert_hydration(target, node, anchor) {
    if (is_hydrating && !anchor) {
        append_hydration(target, node);
    }
    else if (node.parentNode !== target || node.nextSibling != anchor) {
        target.insertBefore(node, anchor || null);
    }
}
function detach(node) {
    if (node.parentNode) {
        node.parentNode.removeChild(node);
    }
}
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function children(element) {
    return Array.from(element.childNodes);
}
function init_claim_info(nodes) {
    if (nodes.claim_info === undefined) {
        nodes.claim_info = { last_index: 0, total_claimed: 0 };
    }
}
function claim_node(nodes, predicate, processNode, createNode, dontUpdateLastIndex = false) {
    // Try to find nodes in an order such that we lengthen the longest increasing subsequence
    init_claim_info(nodes);
    const resultNode = (() => {
        // We first try to find an element after the previous one
        for (let i = nodes.claim_info.last_index; i < nodes.length; i++) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                return node;
            }
        }
        // Otherwise, we try to find one before
        // We iterate in reverse so that we don't go too far back
        for (let i = nodes.claim_info.last_index - 1; i >= 0; i--) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                else if (replacement === undefined) {
                    // Since we spliced before the last_index, we decrease it
                    nodes.claim_info.last_index--;
                }
                return node;
            }
        }
        // If we can't find any matching node, we create a new one
        return createNode();
    })();
    resultNode.claim_order = nodes.claim_info.total_claimed;
    nodes.claim_info.total_claimed += 1;
    return resultNode;
}
function claim_element_base(nodes, name, attributes, create_element) {
    return claim_node(nodes, (node) => node.nodeName === name, (node) => {
        const remove = [];
        for (let j = 0; j < node.attributes.length; j++) {
            const attribute = node.attributes[j];
            if (!attributes[attribute.name]) {
                remove.push(attribute.name);
            }
        }
        remove.forEach(v => node.removeAttribute(v));
        return undefined;
    }, () => create_element(name));
}
function claim_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, element);
}
function claim_text(nodes, data) {
    return claim_node(nodes, (node) => node.nodeType === 3, (node) => {
        const dataStr = '' + data;
        if (node.data.startsWith(dataStr)) {
            if (node.data.length !== dataStr.length) {
                return node.splitText(dataStr.length);
            }
        }
        else {
            node.data = dataStr;
        }
    }, () => text(data), true // Text nodes should not update last index since it is likely not worth it to eliminate an increasing subsequence of actual elements
    );
}
function claim_space(nodes) {
    return claim_text(nodes, ' ');
}

let current_component;
function set_current_component(component) {
    current_component = component;
}

const dirty_components = [];
const binding_callbacks = [];
let render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = /* @__PURE__ */ Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();
let flushidx = 0; // Do *not* move this inside the flush() function
function flush() {
    // Do not reenter flush while dirty components are updated, as this can
    // result in an infinite loop. Instead, let the inner flush handle it.
    // Reentrancy is ok afterwards for bindings etc.
    if (flushidx !== 0) {
        return;
    }
    const saved_component = current_component;
    do {
        // first, call beforeUpdate functions
        // and update components
        try {
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
        }
        catch (e) {
            // reset dirty state to not end up in a deadlocked state and then rethrow
            dirty_components.length = 0;
            flushidx = 0;
            throw e;
        }
        set_current_component(null);
        dirty_components.length = 0;
        flushidx = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
/**
 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
 */
function flush_render_callbacks(fns) {
    const filtered = [];
    const targets = [];
    render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
    targets.forEach((c) => c());
    render_callbacks = filtered;
}
const outroing = new Set();
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
            // if the component was destroyed immediately
            // it will update the `$$.on_destroy` reference to `null`.
            // the destructured on_destroy may still reference to the old array
            if (component.$$.on_destroy) {
                component.$$.on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        flush_render_callbacks($$.after_update);
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: [],
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false,
        root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            start_hydrating();
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        end_hydrating();
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        if (!is_function(callback)) {
            return noop;
        }
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

/* generated by Svelte v3.59.1 */

function create_fragment(ctx) {
	let _DOCTYPE;
	let t0;
	let html;
	let head;
	let meta0;
	let t1;
	let meta1;
	let t2;
	let title;
	let t3;
	let t4;
	let link;
	let t5;
	let body;
	let header;
	let div0;
	let a0;
	let t6;
	let t7;
	let nav;
	let a1;
	let t8;
	let t9;
	let a2;
	let t10;
	let t11;
	let a3;
	let t12;
	let t13;
	let a4;
	let t14;
	let t15;
	let div3;
	let a5;
	let t16;
	let t17;
	let div2;
	let button;
	let t18;
	let t19;
	let div1;
	let a6;
	let t20;
	let t21;
	let a7;
	let t22;
	let t23;
	let a8;
	let t24;
	let t25;
	let a9;
	let t26;
	let t27;
	let script;
	let script_src_value;

	return {
		c() {
			_DOCTYPE = element("!DOCTYPE");
			t0 = space();
			html = element("html");
			head = element("head");
			meta0 = element("meta");
			t1 = space();
			meta1 = element("meta");
			t2 = space();
			title = element("title");
			t3 = text("Responsive Navigation Bar");
			t4 = space();
			link = element("link");
			t5 = space();
			body = element("body");
			header = element("header");
			div0 = element("div");
			a0 = element("a");
			t6 = text("Logo");
			t7 = space();
			nav = element("nav");
			a1 = element("a");
			t8 = text("Home");
			t9 = space();
			a2 = element("a");
			t10 = text("About");
			t11 = space();
			a3 = element("a");
			t12 = text("Services");
			t13 = space();
			a4 = element("a");
			t14 = text("Contact");
			t15 = space();
			div3 = element("div");
			a5 = element("a");
			t16 = text("Logo");
			t17 = space();
			div2 = element("div");
			button = element("button");
			t18 = text("☰");
			t19 = space();
			div1 = element("div");
			a6 = element("a");
			t20 = text("Home");
			t21 = space();
			a7 = element("a");
			t22 = text("About");
			t23 = space();
			a8 = element("a");
			t24 = text("Services");
			t25 = space();
			a9 = element("a");
			t26 = text("Contact");
			t27 = space();
			script = element("script");
			this.h();
		},
		l(nodes) {
			_DOCTYPE = claim_element(nodes, "!DOCTYPE", { html: true });
			t0 = claim_space(nodes);
			html = claim_element(nodes, "HTML", { lang: true });
			var html_nodes = children(html);
			head = claim_element(html_nodes, "HEAD", {});
			var head_nodes = children(head);
			meta0 = claim_element(head_nodes, "META", { charset: true });
			t1 = claim_space(head_nodes);
			meta1 = claim_element(head_nodes, "META", { name: true, content: true });
			t2 = claim_space(head_nodes);
			title = claim_element(head_nodes, "TITLE", {});
			var title_nodes = children(title);
			t3 = claim_text(title_nodes, "Responsive Navigation Bar");
			title_nodes.forEach(detach);
			t4 = claim_space(head_nodes);
			link = claim_element(head_nodes, "LINK", { rel: true, href: true });
			head_nodes.forEach(detach);
			t5 = claim_space(html_nodes);
			body = claim_element(html_nodes, "BODY", { class: true });
			var body_nodes = children(body);
			header = claim_element(body_nodes, "HEADER", { class: true });
			var header_nodes = children(header);
			div0 = claim_element(header_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			a0 = claim_element(div0_nodes, "A", { href: true, class: true });
			var a0_nodes = children(a0);
			t6 = claim_text(a0_nodes, "Logo");
			a0_nodes.forEach(detach);
			t7 = claim_space(div0_nodes);
			nav = claim_element(div0_nodes, "NAV", { class: true });
			var nav_nodes = children(nav);
			a1 = claim_element(nav_nodes, "A", { href: true, class: true });
			var a1_nodes = children(a1);
			t8 = claim_text(a1_nodes, "Home");
			a1_nodes.forEach(detach);
			t9 = claim_space(nav_nodes);
			a2 = claim_element(nav_nodes, "A", { href: true, class: true });
			var a2_nodes = children(a2);
			t10 = claim_text(a2_nodes, "About");
			a2_nodes.forEach(detach);
			t11 = claim_space(nav_nodes);
			a3 = claim_element(nav_nodes, "A", { href: true, class: true });
			var a3_nodes = children(a3);
			t12 = claim_text(a3_nodes, "Services");
			a3_nodes.forEach(detach);
			t13 = claim_space(nav_nodes);
			a4 = claim_element(nav_nodes, "A", { href: true, class: true });
			var a4_nodes = children(a4);
			t14 = claim_text(a4_nodes, "Contact");
			a4_nodes.forEach(detach);
			nav_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t15 = claim_space(header_nodes);
			div3 = claim_element(header_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			a5 = claim_element(div3_nodes, "A", { href: true, class: true });
			var a5_nodes = children(a5);
			t16 = claim_text(a5_nodes, "Logo");
			a5_nodes.forEach(detach);
			t17 = claim_space(div3_nodes);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			button = claim_element(div2_nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			t18 = claim_text(button_nodes, "☰");
			button_nodes.forEach(detach);
			t19 = claim_space(div2_nodes);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			a6 = claim_element(div1_nodes, "A", { href: true, class: true });
			var a6_nodes = children(a6);
			t20 = claim_text(a6_nodes, "Home");
			a6_nodes.forEach(detach);
			t21 = claim_space(div1_nodes);
			a7 = claim_element(div1_nodes, "A", { href: true, class: true });
			var a7_nodes = children(a7);
			t22 = claim_text(a7_nodes, "About");
			a7_nodes.forEach(detach);
			t23 = claim_space(div1_nodes);
			a8 = claim_element(div1_nodes, "A", { href: true, class: true });
			var a8_nodes = children(a8);
			t24 = claim_text(a8_nodes, "Services");
			a8_nodes.forEach(detach);
			t25 = claim_space(div1_nodes);
			a9 = claim_element(div1_nodes, "A", { href: true, class: true });
			var a9_nodes = children(a9);
			t26 = claim_text(a9_nodes, "Contact");
			a9_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			header_nodes.forEach(detach);
			t27 = claim_space(body_nodes);
			script = claim_element(body_nodes, "SCRIPT", { src: true });
			var script_nodes = children(script);
			script_nodes.forEach(detach);
			body_nodes.forEach(detach);
			html_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(_DOCTYPE, "html", "");
			attr(meta0, "charset", "UTF-8");
			attr(meta1, "name", "viewport");
			attr(meta1, "content", "width=device-width, initial-scale=1.0");
			attr(link, "rel", "stylesheet");
			attr(link, "href", "styles.css");
			attr(a0, "href", "/");
			attr(a0, "class", "logo svelte-2mo3x3");
			attr(a1, "href", "/ab");
			attr(a1, "class", "link svelte-2mo3x3");
			attr(a2, "href", "/ab");
			attr(a2, "class", "link svelte-2mo3x3");
			attr(a3, "href", "/ab");
			attr(a3, "class", "link svelte-2mo3x3");
			attr(a4, "href", "/ab");
			attr(a4, "class", "link svelte-2mo3x3");
			attr(nav, "class", "svelte-2mo3x3");
			attr(div0, "class", "desktop-nav svelte-2mo3x3");
			attr(a5, "href", "/");
			attr(a5, "class", "logo svelte-2mo3x3");
			attr(button, "class", "dropbtn svelte-2mo3x3");
			attr(a6, "href", "/ab");
			attr(a6, "class", "mobile-link svelte-2mo3x3");
			attr(a7, "href", "/ab");
			attr(a7, "class", "mobile-link svelte-2mo3x3");
			attr(a8, "href", "/ab");
			attr(a8, "class", "mobile-link svelte-2mo3x3");
			attr(a9, "href", "/ab");
			attr(a9, "class", "mobile-link svelte-2mo3x3");
			attr(div1, "class", "dropdown-content svelte-2mo3x3");
			attr(div2, "class", "dropdown svelte-2mo3x3");
			attr(div3, "class", "mobile-nav svelte-2mo3x3");
			attr(header, "class", "section-container svelte-2mo3x3");
			if (!src_url_equal(script.src, script_src_value = "script.js")) attr(script, "src", script_src_value);
			attr(body, "class", "svelte-2mo3x3");
			attr(html, "lang", "en");
		},
		m(target, anchor) {
			insert_hydration(target, _DOCTYPE, anchor);
			insert_hydration(target, t0, anchor);
			insert_hydration(target, html, anchor);
			append_hydration(html, head);
			append_hydration(head, meta0);
			append_hydration(head, t1);
			append_hydration(head, meta1);
			append_hydration(head, t2);
			append_hydration(head, title);
			append_hydration(title, t3);
			append_hydration(head, t4);
			append_hydration(head, link);
			append_hydration(html, t5);
			append_hydration(html, body);
			append_hydration(body, header);
			append_hydration(header, div0);
			append_hydration(div0, a0);
			append_hydration(a0, t6);
			append_hydration(div0, t7);
			append_hydration(div0, nav);
			append_hydration(nav, a1);
			append_hydration(a1, t8);
			append_hydration(nav, t9);
			append_hydration(nav, a2);
			append_hydration(a2, t10);
			append_hydration(nav, t11);
			append_hydration(nav, a3);
			append_hydration(a3, t12);
			append_hydration(nav, t13);
			append_hydration(nav, a4);
			append_hydration(a4, t14);
			append_hydration(header, t15);
			append_hydration(header, div3);
			append_hydration(div3, a5);
			append_hydration(a5, t16);
			append_hydration(div3, t17);
			append_hydration(div3, div2);
			append_hydration(div2, button);
			append_hydration(button, t18);
			append_hydration(div2, t19);
			append_hydration(div2, div1);
			append_hydration(div1, a6);
			append_hydration(a6, t20);
			append_hydration(div1, t21);
			append_hydration(div1, a7);
			append_hydration(a7, t22);
			append_hydration(div1, t23);
			append_hydration(div1, a8);
			append_hydration(a8, t24);
			append_hydration(div1, t25);
			append_hydration(div1, a9);
			append_hydration(a9, t26);
			append_hydration(body, t27);
			append_hydration(body, script);
		},
		p: noop,
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(_DOCTYPE);
			if (detaching) detach(t0);
			if (detaching) detach(html);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;
	let { logo } = $$props;
	let { site_nav } = $$props;

	document.addEventListener("DOMContentLoaded", function () {
		const dropbtn = document.querySelector('.dropbtn');
		const dropdownContent = document.querySelector('.dropdown-content');

		dropbtn.addEventListener('click', function () {
			dropdownContent.classList.toggle('show');
		});

		// Close the dropdown if the user clicks outside of it
		window.onclick = function (event) {
			if (!event.target.matches('.dropbtn')) {
				const dropdowns = document.querySelectorAll('.dropdown-content');

				dropdowns.forEach(function (dropdown) {
					if (dropdown.classList.contains('show')) {
						dropdown.classList.remove('show');
					}
				});
			}
		};
	});

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(0, props = $$props.props);
		if ('logo' in $$props) $$invalidate(1, logo = $$props.logo);
		if ('site_nav' in $$props) $$invalidate(2, site_nav = $$props.site_nav);
	};

	return [props, logo, site_nav];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, { props: 0, logo: 1, site_nav: 2 });
	}
}

export { Component as default };
