// node_modules/@mdi/js/mdi.js
var e = "M9 4L11.5 9.5L17 12L11.5 14.5L9 20L6.5 14.5L1 12L6.5 9.5L9 4M9 8.83L8 11L5.83 12L8 13L9 15.17L10 13L12.17 12L10 11L9 8.83M19 9L17.74 6.26L15 5L17.74 3.75L19 1L20.25 3.75L23 5L20.25 6.26L19 9M19 23L17.74 20.26L15 19L17.74 17.75L19 15L20.25 17.75L23 19L20.25 20.26L19 23Z", t = "M10,5V10H9V5H5V13H9V12H10V17H9V14H5V19H12V17H13V19H19V17H21V21H3V3H21V15H19V10H13V15H12V9H19V5H10Z", n = "M21,17H7V3H21M21,1H7A2,2 0 0,0 5,3V17A2,2 0 0,0 7,19H21A2,2 0 0,0 23,17V3A2,2 0 0,0 21,1M3,5H1V21A2,2 0 0,0 3,23H19V21H3M15.96,10.29L13.21,13.83L11.25,11.47L8.5,15H19.5L15.96,10.29Z", r = "M12,3.77L11.25,4.61C11.25,4.61 9.97,6.06 8.68,7.94C7.39,9.82 6,12.07 6,14.23A6,6 0 0,0 12,20.23A6,6 0 0,0 18,14.23C18,12.07 16.61,9.82 15.32,7.94C14.03,6.06 12.75,4.61 12.75,4.61L12,3.77M12,6.9C12.44,7.42 12.84,7.85 13.68,9.07C14.89,10.83 16,13.07 16,14.23C16,16.45 14.22,18.23 12,18.23C9.78,18.23 8,16.45 8,14.23C8,13.07 9.11,10.83 10.32,9.07C11.16,7.85 11.56,7.42 12,6.9Z", i = globalThis, a = i.ShadowRoot && (i.ShadyCSS === void 0 || i.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, o = Symbol(), s = /* @__PURE__ */ new WeakMap(), c = class {
	constructor(e, t, n) {
		if (this._$cssResult$ = !0, n !== o) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
		this.cssText = e, this.t = t;
	}
	get styleSheet() {
		let e = this.o, t = this.t;
		if (a && e === void 0) {
			let n = t !== void 0 && t.length === 1;
			n && (e = s.get(t)), e === void 0 && ((this.o = e = new CSSStyleSheet()).replaceSync(this.cssText), n && s.set(t, e));
		}
		return e;
	}
	toString() {
		return this.cssText;
	}
}, l = (e) => new c(typeof e == "string" ? e : e + "", void 0, o), u = (e, ...t) => new c(e.length === 1 ? e[0] : t.reduce((t, n, r) => t + ((e) => {
	if (!0 === e._$cssResult$) return e.cssText;
	if (typeof e == "number") return e;
	throw Error("Value passed to 'css' function must be a 'css' function result: " + e + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
})(n) + e[r + 1], e[0]), e, o), d = (e, t) => {
	if (a) e.adoptedStyleSheets = t.map((e) => e instanceof CSSStyleSheet ? e : e.styleSheet);
	else for (let n of t) {
		let t = document.createElement("style"), r = i.litNonce;
		r !== void 0 && t.setAttribute("nonce", r), t.textContent = n.cssText, e.appendChild(t);
	}
}, f = a ? (e) => e : (e) => e instanceof CSSStyleSheet ? ((e) => {
	let t = "";
	for (let n of e.cssRules) t += n.cssText;
	return l(t);
})(e) : e, { is: ee, defineProperty: te, getOwnPropertyDescriptor: ne, getOwnPropertyNames: re, getOwnPropertySymbols: ie, getPrototypeOf: ae } = Object, p = globalThis, m = p.trustedTypes, oe = m ? m.emptyScript : "", se = p.reactiveElementPolyfillSupport, h = (e, t) => e, g = {
	toAttribute(e, t) {
		switch (t) {
			case Boolean:
				e = e ? oe : null;
				break;
			case Object:
			case Array: e = e == null ? e : JSON.stringify(e);
		}
		return e;
	},
	fromAttribute(e, t) {
		let n = e;
		switch (t) {
			case Boolean:
				n = e !== null;
				break;
			case Number:
				n = e === null ? null : Number(e);
				break;
			case Object:
			case Array: try {
				n = JSON.parse(e);
			} catch {
				n = null;
			}
		}
		return n;
	}
}, _ = (e, t) => !ee(e, t), v = {
	attribute: !0,
	type: String,
	converter: g,
	reflect: !1,
	useDefault: !1,
	hasChanged: _
};
Symbol.metadata ??= Symbol("metadata"), p.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
var y = class extends HTMLElement {
	static addInitializer(e) {
		this._$Ei(), (this.l ??= []).push(e);
	}
	static get observedAttributes() {
		return this.finalize(), this._$Eh && [...this._$Eh.keys()];
	}
	static createProperty(e, t = v) {
		if (t.state && (t.attribute = !1), this._$Ei(), this.prototype.hasOwnProperty(e) && ((t = Object.create(t)).wrapped = !0), this.elementProperties.set(e, t), !t.noAccessor) {
			let n = Symbol(), r = this.getPropertyDescriptor(e, n, t);
			r !== void 0 && te(this.prototype, e, r);
		}
	}
	static getPropertyDescriptor(e, t, n) {
		let { get: r, set: i } = ne(this.prototype, e) ?? {
			get() {
				return this[t];
			},
			set(e) {
				this[t] = e;
			}
		};
		return {
			get: r,
			set(t) {
				let a = r?.call(this);
				i?.call(this, t), this.requestUpdate(e, a, n);
			},
			configurable: !0,
			enumerable: !0
		};
	}
	static getPropertyOptions(e) {
		return this.elementProperties.get(e) ?? v;
	}
	static _$Ei() {
		if (this.hasOwnProperty(h("elementProperties"))) return;
		let e = ae(this);
		e.finalize(), e.l !== void 0 && (this.l = [...e.l]), this.elementProperties = new Map(e.elementProperties);
	}
	static finalize() {
		if (this.hasOwnProperty(h("finalized"))) return;
		if (this.finalized = !0, this._$Ei(), this.hasOwnProperty(h("properties"))) {
			let e = this.properties, t = [...re(e), ...ie(e)];
			for (let n of t) this.createProperty(n, e[n]);
		}
		let e = this[Symbol.metadata];
		if (e !== null) {
			let t = litPropertyMetadata.get(e);
			if (t !== void 0) for (let [e, n] of t) this.elementProperties.set(e, n);
		}
		this._$Eh = /* @__PURE__ */ new Map();
		for (let [e, t] of this.elementProperties) {
			let n = this._$Eu(e, t);
			n !== void 0 && this._$Eh.set(n, e);
		}
		this.elementStyles = this.finalizeStyles(this.styles);
	}
	static finalizeStyles(e) {
		let t = [];
		if (Array.isArray(e)) {
			let n = new Set(e.flat(1 / 0).reverse());
			for (let e of n) t.unshift(f(e));
		} else e !== void 0 && t.push(f(e));
		return t;
	}
	static _$Eu(e, t) {
		let n = t.attribute;
		return !1 === n ? void 0 : typeof n == "string" ? n : typeof e == "string" ? e.toLowerCase() : void 0;
	}
	constructor() {
		super(), this._$Ep = void 0, this.isUpdatePending = !1, this.hasUpdated = !1, this._$Em = null, this._$Ev();
	}
	_$Ev() {
		this._$ES = new Promise((e) => this.enableUpdating = e), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((e) => e(this));
	}
	addController(e) {
		(this._$EO ??= /* @__PURE__ */ new Set()).add(e), this.renderRoot !== void 0 && this.isConnected && e.hostConnected?.();
	}
	removeController(e) {
		this._$EO?.delete(e);
	}
	_$E_() {
		let e = /* @__PURE__ */ new Map(), t = this.constructor.elementProperties;
		for (let n of t.keys()) this.hasOwnProperty(n) && (e.set(n, this[n]), delete this[n]);
		e.size > 0 && (this._$Ep = e);
	}
	createRenderRoot() {
		let e = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
		return d(e, this.constructor.elementStyles), e;
	}
	connectedCallback() {
		this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(!0), this._$EO?.forEach((e) => e.hostConnected?.());
	}
	enableUpdating(e) {}
	disconnectedCallback() {
		this._$EO?.forEach((e) => e.hostDisconnected?.());
	}
	attributeChangedCallback(e, t, n) {
		this._$AK(e, n);
	}
	_$ET(e, t) {
		let n = this.constructor.elementProperties.get(e), r = this.constructor._$Eu(e, n);
		if (r !== void 0 && !0 === n.reflect) {
			let i = (n.converter?.toAttribute === void 0 ? g : n.converter).toAttribute(t, n.type);
			this._$Em = e, i == null ? this.removeAttribute(r) : this.setAttribute(r, i), this._$Em = null;
		}
	}
	_$AK(e, t) {
		let n = this.constructor, r = n._$Eh.get(e);
		if (r !== void 0 && this._$Em !== r) {
			let e = n.getPropertyOptions(r), i = typeof e.converter == "function" ? { fromAttribute: e.converter } : e.converter?.fromAttribute === void 0 ? g : e.converter;
			this._$Em = r;
			let a = i.fromAttribute(t, e.type);
			this[r] = a ?? this._$Ej?.get(r) ?? a, this._$Em = null;
		}
	}
	requestUpdate(e, t, n, r = !1, i) {
		if (e !== void 0) {
			let a = this.constructor;
			if (!1 === r && (i = this[e]), n ??= a.getPropertyOptions(e), !((n.hasChanged ?? _)(i, t) || n.useDefault && n.reflect && i === this._$Ej?.get(e) && !this.hasAttribute(a._$Eu(e, n)))) return;
			this.C(e, t, n);
		}
		!1 === this.isUpdatePending && (this._$ES = this._$EP());
	}
	C(e, t, { useDefault: n, reflect: r, wrapped: i }, a) {
		n && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(e) && (this._$Ej.set(e, a ?? t ?? this[e]), !0 !== i || a !== void 0) || (this._$AL.has(e) || (this.hasUpdated || n || (t = void 0), this._$AL.set(e, t)), !0 === r && this._$Em !== e && (this._$Eq ??= /* @__PURE__ */ new Set()).add(e));
	}
	async _$EP() {
		this.isUpdatePending = !0;
		try {
			await this._$ES;
		} catch (e) {
			Promise.reject(e);
		}
		let e = this.scheduleUpdate();
		return e != null && await e, !this.isUpdatePending;
	}
	scheduleUpdate() {
		return this.performUpdate();
	}
	performUpdate() {
		if (!this.isUpdatePending) return;
		if (!this.hasUpdated) {
			if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
				for (let [e, t] of this._$Ep) this[e] = t;
				this._$Ep = void 0;
			}
			let e = this.constructor.elementProperties;
			if (e.size > 0) for (let [t, n] of e) {
				let { wrapped: e } = n, r = this[t];
				!0 !== e || this._$AL.has(t) || r === void 0 || this.C(t, void 0, n, r);
			}
		}
		let e = !1, t = this._$AL;
		try {
			e = this.shouldUpdate(t), e ? (this.willUpdate(t), this._$EO?.forEach((e) => e.hostUpdate?.()), this.update(t)) : this._$EM();
		} catch (t) {
			throw e = !1, this._$EM(), t;
		}
		e && this._$AE(t);
	}
	willUpdate(e) {}
	_$AE(e) {
		this._$EO?.forEach((e) => e.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = !0, this.firstUpdated(e)), this.updated(e);
	}
	_$EM() {
		this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = !1;
	}
	get updateComplete() {
		return this.getUpdateComplete();
	}
	getUpdateComplete() {
		return this._$ES;
	}
	shouldUpdate(e) {
		return !0;
	}
	update(e) {
		this._$Eq &&= this._$Eq.forEach((e) => this._$ET(e, this[e])), this._$EM();
	}
	updated(e) {}
	firstUpdated(e) {}
};
y.elementStyles = [], y.shadowRootOptions = { mode: "open" }, y[h("elementProperties")] = /* @__PURE__ */ new Map(), y[h("finalized")] = /* @__PURE__ */ new Map(), se?.({ ReactiveElement: y }), (p.reactiveElementVersions ??= []).push("2.1.2");
// node_modules/lit-html/lit-html.js
var b = globalThis, x = (e) => e, S = b.trustedTypes, C = S ? S.createPolicy("lit-html", { createHTML: (e) => e }) : void 0, w = "$lit$", T = `lit$${Math.random().toFixed(9).slice(2)}$`, E = "?" + T, ce = `<${E}>`, D = document, O = () => D.createComment(""), k = (e) => e === null || typeof e != "object" && typeof e != "function", A = Array.isArray, le = (e) => A(e) || typeof e?.[Symbol.iterator] == "function", j = "[ 	\n\f\r]", M = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, N = /-->/g, P = />/g, F = RegExp(`>|${j}(?:([^\\s"'>=/]+)(${j}*=${j}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`, "g"), I = /'/g, L = /"/g, R = /^(?:script|style|textarea|title)$/i, z = ((e) => (t, ...n) => ({
	_$litType$: e,
	strings: t,
	values: n
}))(1), B = Symbol.for("lit-noChange"), V = Symbol.for("lit-nothing"), H = /* @__PURE__ */ new WeakMap(), U = D.createTreeWalker(D, 129);
function W(e, t) {
	if (!A(e) || !e.hasOwnProperty("raw")) throw Error("invalid template strings array");
	return C === void 0 ? t : C.createHTML(t);
}
var ue = (e, t) => {
	let n = e.length - 1, r = [], i, a = t === 2 ? "<svg>" : t === 3 ? "<math>" : "", o = M;
	for (let t = 0; t < n; t++) {
		let n = e[t], s, c, l = -1, u = 0;
		for (; u < n.length && (o.lastIndex = u, c = o.exec(n), c !== null);) u = o.lastIndex, o === M ? c[1] === "!--" ? o = N : c[1] === void 0 ? c[2] === void 0 ? c[3] !== void 0 && (o = F) : (R.test(c[2]) && (i = RegExp("</" + c[2], "g")), o = F) : o = P : o === F ? c[0] === ">" ? (o = i ?? M, l = -1) : c[1] === void 0 ? l = -2 : (l = o.lastIndex - c[2].length, s = c[1], o = c[3] === void 0 ? F : c[3] === "\"" ? L : I) : o === L || o === I ? o = F : o === N || o === P ? o = M : (o = F, i = void 0);
		let d = o === F && e[t + 1].startsWith("/>") ? " " : "";
		a += o === M ? n + ce : l >= 0 ? (r.push(s), n.slice(0, l) + w + n.slice(l) + T + d) : n + T + (l === -2 ? t : d);
	}
	return [W(e, a + (e[n] || "<?>") + (t === 2 ? "</svg>" : t === 3 ? "</math>" : "")), r];
}, G = class e {
	constructor({ strings: t, _$litType$: n }, r) {
		let i;
		this.parts = [];
		let a = 0, o = 0, s = t.length - 1, c = this.parts, [l, u] = ue(t, n);
		if (this.el = e.createElement(l, r), U.currentNode = this.el.content, n === 2 || n === 3) {
			let e = this.el.content.firstChild;
			e.replaceWith(...e.childNodes);
		}
		for (; (i = U.nextNode()) !== null && c.length < s;) {
			if (i.nodeType === 1) {
				if (i.hasAttributes()) for (let e of i.getAttributeNames()) if (e.endsWith(w)) {
					let t = u[o++], n = i.getAttribute(e).split(T), r = /([.?@])?(.*)/.exec(t);
					c.push({
						type: 1,
						index: a,
						name: r[2],
						strings: n,
						ctor: r[1] === "." ? fe : r[1] === "?" ? pe : r[1] === "@" ? me : J
					}), i.removeAttribute(e);
				} else e.startsWith(T) && (c.push({
					type: 6,
					index: a
				}), i.removeAttribute(e));
				if (R.test(i.tagName)) {
					let e = i.textContent.split(T), t = e.length - 1;
					if (t > 0) {
						i.textContent = S ? S.emptyScript : "";
						for (let n = 0; n < t; n++) i.append(e[n], O()), U.nextNode(), c.push({
							type: 2,
							index: ++a
						});
						i.append(e[t], O());
					}
				}
			} else if (i.nodeType === 8) {
				if (i.data === E) c.push({
					type: 2,
					index: a
				});
				else {
					let e = -1;
					for (; (e = i.data.indexOf(T, e + 1)) !== -1;) c.push({
						type: 7,
						index: a
					}), e += T.length - 1;
				}
			}
			a++;
		}
	}
	static createElement(e, t) {
		let n = D.createElement("template");
		return n.innerHTML = e, n;
	}
};
function K(e, t, n = e, r) {
	if (t === B) return t;
	let i = r === void 0 ? n._$Cl : n._$Co?.[r], a = k(t) ? void 0 : t._$litDirective$;
	return i?.constructor !== a && (i?._$AO?.(!1), a === void 0 ? i = void 0 : (i = new a(e), i._$AT(e, n, r)), r === void 0 ? n._$Cl = i : (n._$Co ??= [])[r] = i), i !== void 0 && (t = K(e, i._$AS(e, t.values), i, r)), t;
}
var de = class {
	constructor(e, t) {
		this._$AV = [], this._$AN = void 0, this._$AD = e, this._$AM = t;
	}
	get parentNode() {
		return this._$AM.parentNode;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	u(e) {
		let { el: { content: t }, parts: n } = this._$AD, r = (e?.creationScope ?? D).importNode(t, !0);
		U.currentNode = r;
		let i = U.nextNode(), a = 0, o = 0, s = n[0];
		for (; s !== void 0;) {
			if (a === s.index) {
				let t;
				s.type === 2 ? t = new q(i, i.nextSibling, this, e) : s.type === 1 ? t = new s.ctor(i, s.name, s.strings, this, e) : s.type === 6 && (t = new he(i, this, e)), this._$AV.push(t), s = n[++o];
			}
			a !== s?.index && (i = U.nextNode(), a++);
		}
		return U.currentNode = D, r;
	}
	p(e) {
		let t = 0;
		for (let n of this._$AV) n !== void 0 && (n.strings === void 0 ? n._$AI(e[t]) : (n._$AI(e, n, t), t += n.strings.length - 2)), t++;
	}
}, q = class e {
	get _$AU() {
		return this._$AM?._$AU ?? this._$Cv;
	}
	constructor(e, t, n, r) {
		this.type = 2, this._$AH = V, this._$AN = void 0, this._$AA = e, this._$AB = t, this._$AM = n, this.options = r, this._$Cv = r?.isConnected ?? !0;
	}
	get parentNode() {
		let e = this._$AA.parentNode, t = this._$AM;
		return t !== void 0 && e?.nodeType === 11 && (e = t.parentNode), e;
	}
	get startNode() {
		return this._$AA;
	}
	get endNode() {
		return this._$AB;
	}
	_$AI(e, t = this) {
		e = K(this, e, t), k(e) ? e === V || e == null || e === "" ? (this._$AH !== V && this._$AR(), this._$AH = V) : e !== this._$AH && e !== B && this._(e) : e._$litType$ === void 0 ? e.nodeType === void 0 ? le(e) ? this.k(e) : this._(e) : this.T(e) : this.$(e);
	}
	O(e) {
		return this._$AA.parentNode.insertBefore(e, this._$AB);
	}
	T(e) {
		this._$AH !== e && (this._$AR(), this._$AH = this.O(e));
	}
	_(e) {
		this._$AH !== V && k(this._$AH) ? this._$AA.nextSibling.data = e : this.T(D.createTextNode(e)), this._$AH = e;
	}
	$(e) {
		let { values: t, _$litType$: n } = e, r = typeof n == "number" ? this._$AC(e) : (n.el === void 0 && (n.el = G.createElement(W(n.h, n.h[0]), this.options)), n);
		if (this._$AH?._$AD === r) this._$AH.p(t);
		else {
			let e = new de(r, this), n = e.u(this.options);
			e.p(t), this.T(n), this._$AH = e;
		}
	}
	_$AC(e) {
		let t = H.get(e.strings);
		return t === void 0 && H.set(e.strings, t = new G(e)), t;
	}
	k(t) {
		A(this._$AH) || (this._$AH = [], this._$AR());
		let n = this._$AH, r, i = 0;
		for (let a of t) i === n.length ? n.push(r = new e(this.O(O()), this.O(O()), this, this.options)) : r = n[i], r._$AI(a), i++;
		i < n.length && (this._$AR(r && r._$AB.nextSibling, i), n.length = i);
	}
	_$AR(e = this._$AA.nextSibling, t) {
		for (this._$AP?.(!1, !0, t); e !== this._$AB;) {
			let t = x(e).nextSibling;
			x(e).remove(), e = t;
		}
	}
	setConnected(e) {
		this._$AM === void 0 && (this._$Cv = e, this._$AP?.(e));
	}
}, J = class {
	get tagName() {
		return this.element.tagName;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	constructor(e, t, n, r, i) {
		this.type = 1, this._$AH = V, this._$AN = void 0, this.element = e, this.name = t, this._$AM = r, this.options = i, n.length > 2 || n[0] !== "" || n[1] !== "" ? (this._$AH = Array(n.length - 1).fill(/* @__PURE__ */ new String()), this.strings = n) : this._$AH = V;
	}
	_$AI(e, t = this, n, r) {
		let i = this.strings, a = !1;
		if (i === void 0) e = K(this, e, t, 0), a = !k(e) || e !== this._$AH && e !== B, a && (this._$AH = e);
		else {
			let r = e, o, s;
			for (e = i[0], o = 0; o < i.length - 1; o++) s = K(this, r[n + o], t, o), s === B && (s = this._$AH[o]), a ||= !k(s) || s !== this._$AH[o], s === V ? e = V : e !== V && (e += (s ?? "") + i[o + 1]), this._$AH[o] = s;
		}
		a && !r && this.j(e);
	}
	j(e) {
		e === V ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, e ?? "");
	}
}, fe = class extends J {
	constructor() {
		super(...arguments), this.type = 3;
	}
	j(e) {
		this.element[this.name] = e === V ? void 0 : e;
	}
}, pe = class extends J {
	constructor() {
		super(...arguments), this.type = 4;
	}
	j(e) {
		this.element.toggleAttribute(this.name, !!e && e !== V);
	}
}, me = class extends J {
	constructor(e, t, n, r, i) {
		super(e, t, n, r, i), this.type = 5;
	}
	_$AI(e, t = this) {
		if ((e = K(this, e, t, 0) ?? V) === B) return;
		let n = this._$AH, r = e === V && n !== V || e.capture !== n.capture || e.once !== n.once || e.passive !== n.passive, i = e !== V && (n === V || r);
		r && this.element.removeEventListener(this.name, this, n), i && this.element.addEventListener(this.name, this, e), this._$AH = e;
	}
	handleEvent(e) {
		typeof this._$AH == "function" ? this._$AH.call(this.options?.host ?? this.element, e) : this._$AH.handleEvent(e);
	}
}, he = class {
	constructor(e, t, n) {
		this.element = e, this.type = 6, this._$AN = void 0, this._$AM = t, this.options = n;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	_$AI(e) {
		K(this, e);
	}
}, ge = b.litHtmlPolyfillSupport;
ge?.(G, q), (b.litHtmlVersions ??= []).push("3.3.3");
var _e = (e, t, n) => {
	let r = n?.renderBefore ?? t, i = r._$litPart$;
	if (i === void 0) {
		let e = n?.renderBefore ?? null;
		r._$litPart$ = i = new q(t.insertBefore(O(), e), e, void 0, n ?? {});
	}
	return i._$AI(e), i;
}, Y = globalThis, X = class extends y {
	constructor() {
		super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
	}
	createRenderRoot() {
		let e = super.createRenderRoot();
		return this.renderOptions.renderBefore ??= e.firstChild, e;
	}
	update(e) {
		let t = this.render();
		this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(e), this._$Do = _e(t, this.renderRoot, this.renderOptions);
	}
	connectedCallback() {
		super.connectedCallback(), this._$Do?.setConnected(!0);
	}
	disconnectedCallback() {
		super.disconnectedCallback(), this._$Do?.setConnected(!1);
	}
	render() {
		return B;
	}
};
X._$litElement$ = !0, X.finalized = !0, Y.litElementHydrateSupport?.({ LitElement: X });
var ve = Y.litElementPolyfillSupport;
ve?.({ LitElement: X }), (Y.litElementVersions ??= []).push("4.2.2");
// src/api/client.ts
var ye = "plant_garden";
function be(e) {
	return e.callWS({ type: `${ye}/info` });
}
function xe(e) {
	return e instanceof Error ? e.message : typeof e == "object" && e && "message" in e ? String(e.message) : String(e);
}
// src/components/hero.ts
var Se = z`
  <svg viewBox="0 0 800 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="pg-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="sky-top" />
        <stop offset="1" class="sky-bottom" />
      </linearGradient>
    </defs>
    <rect width="800" height="220" fill="url(#pg-sky)" />
    <circle cx="660" cy="62" r="30" class="sun" />
    <path class="hill-back" d="M0 150 C 140 110 260 120 400 140 S 660 110 800 132 V220 H0 Z" />
    <path class="hill-front" d="M0 178 C 160 150 300 160 440 176 S 680 158 800 170 V220 H0 Z" />
    <path class="soil" d="M0 204 C 200 190 420 196 800 200 V220 H0 Z" />
    <g class="leaf" transform="translate(220 150)">
      <rect x="-2" y="-46" width="4" height="50" rx="2" />
      <path d="M0 -30 C -26 -34 -40 -54 -38 -70 C -18 -66 -4 -52 0 -30 Z" />
      <path d="M0 -40 C 22 -46 38 -66 36 -84 C 14 -78 2 -62 0 -40 Z" />
    </g>
    <g class="leaf small" transform="translate(540 160)">
      <rect x="-1.5" y="-30" width="3" height="34" rx="1.5" />
      <path d="M0 -18 C -18 -22 -26 -34 -25 -46 C -12 -42 -2 -32 0 -18 Z" />
      <path d="M0 -24 C 16 -28 26 -42 24 -54 C 10 -50 1 -38 0 -24 Z" />
    </g>
    <g class="water">
      <path d="M332 92 c 0 0 -8 10 -8 15 a 8 8 0 0 0 16 0 c 0 -5 -8 -15 -8 -15 z" />
      <path d="M356 112 c 0 0 -6 8 -6 12 a 6 6 0 0 0 12 0 c 0 -4 -6 -12 -6 -12 z" />
    </g>
  </svg>
`, Ce = u`
  .hero .sky-top {
    stop-color: var(--pg-sky-top);
  }
  .hero .sky-bottom {
    stop-color: var(--pg-sky-bottom);
  }
  .hero .sun {
    fill: var(--pg-sun);
    opacity: 0.85;
  }
  .hero .hill-back {
    fill: var(--pg-leaf-soft);
  }
  .hero .hill-front {
    fill: var(--pg-leaf);
    opacity: 0.55;
  }
  .hero .soil {
    fill: var(--pg-soil);
    opacity: 0.5;
  }
  .hero .leaf {
    fill: var(--pg-leaf);
  }
  .hero .leaf.small {
    opacity: 0.8;
  }
  .hero .water {
    fill: var(--pg-water);
    opacity: 0.7;
  }
`, we = {
	"panel.open_sidebar": "Seitenleiste öffnen",
	"panel.loading": "Dein Garten wird geladen …",
	"panel.error_title": "Plant Garden ist nicht erreichbar",
	"panel.error_hint": "Im Home-Assistant-Protokoll findest du Meldungen von plant_garden.",
	"panel.retry": "Erneut versuchen",
	"welcome.title": "Willkommen in {garden}",
	"welcome.lead": "Plant Garden wird gerade eingerichtet. Bald zeichnest du hier deinen Garten, platzierst Pflanzen und Bewässerungszonen und behältst Wasser und Pflanzengesundheit im Blick.",
	"feature.plan.title": "Gartenplan",
	"feature.plan.body": "Grundriss zeichnen, Pflanzen und Bewässerungszonen per Drag-and-drop platzieren.",
	"feature.plants.title": "Pflanzen & Fotos",
	"feature.plants.body": "Wachstum und Probleme jeder Pflanze mit Fotos dokumentieren.",
	"feature.water.title": "Wasserbilanz",
	"feature.water.body": "Regen, Verdunstung und Bewässerung pro Pflanze, täglich berechnet.",
	"feature.ai.title": "KI-Assistent",
	"feature.ai.body": "Bestimmung, Diagnose und Tipps mit deinem eigenen API-Key.",
	"feature.coming": "In Arbeit",
	"meta.version": "Version {version}",
	"meta.connected": "Mit Home Assistant verbunden"
}, Z = {
	"panel.open_sidebar": "Open sidebar",
	"panel.loading": "Loading your garden…",
	"panel.error_title": "Plant Garden is not reachable",
	"panel.error_hint": "Check the Home Assistant log for messages from plant_garden.",
	"panel.retry": "Try again",
	"welcome.title": "Welcome to {garden}",
	"welcome.lead": "Plant Garden is being set up. Soon you will draw your garden here, place plants and irrigation zones and keep an eye on water and plant health.",
	"feature.plan.title": "Garden plan",
	"feature.plan.body": "Draw the layout and drag plants and irrigation zones into place.",
	"feature.plants.title": "Plants & photos",
	"feature.plants.body": "Document growth and problems with photos for every plant.",
	"feature.water.title": "Water balance",
	"feature.water.body": "Rain, evaporation and irrigation per plant, calculated daily.",
	"feature.ai.title": "AI assistant",
	"feature.ai.body": "Identification, diagnosis and tips with your own API key.",
	"feature.coming": "In progress",
	"meta.version": "Version {version}",
	"meta.connected": "Connected to Home Assistant"
}, Te = {
	de: we,
	en: Z
};
function Ee(e) {
	return Te[(e ?? "en").toLowerCase().split("-")[0] ?? "en"] ?? Z;
}
function Q(e) {
	let t = Ee(e);
	return (e, n) => {
		let r = t[e] ?? Z[e] ?? e;
		return n ? r.replace(/\{(\w+)\}/g, (e, t) => t in n ? String(n[t]) : e) : r;
	};
}
// src/styles/tokens.ts
var De = u`
  :host {
    --pg-bg: var(--primary-background-color, #f6f5f1);
    --pg-surface: var(--card-background-color, #ffffff);
    --pg-text: var(--primary-text-color, #1f2a1f);
    --pg-text-muted: var(--secondary-text-color, #5d6b5d);
    --pg-divider: var(--divider-color, rgba(0, 0, 0, 0.12));
    --pg-accent: var(--primary-color, #3f7d4e);
    --pg-radius: var(--ha-card-border-radius, 12px);
    --pg-shadow: var(
      --ha-card-box-shadow,
      0 1px 2px rgba(0, 0, 0, 0.06),
      0 2px 8px rgba(0, 0, 0, 0.06)
    );
    --pg-font: var(--ha-font-family-body, var(--paper-font-body1_-_font-family, system-ui));

    --pg-leaf: #4f8a5b;
    --pg-leaf-soft: #cfe5c2;
    --pg-soil: #8a6a4f;
    --pg-water: #3d8bd9;
    --pg-sun: #f2c14e;
    --pg-sky-top: #e6f2fb;
    --pg-sky-bottom: #f7fbf2;
  }

  :host([dark]) {
    --pg-leaf: #74b382;
    --pg-leaf-soft: #2c4632;
    --pg-soil: #a8896f;
    --pg-water: #6aaef0;
    --pg-sun: #d8a93b;
    --pg-sky-top: #18222c;
    --pg-sky-bottom: #1b241d;
  }
`, Oe = [
	{
		icon: t,
		title: "feature.plan.title",
		body: "feature.plan.body"
	},
	{
		icon: n,
		title: "feature.plants.title",
		body: "feature.plants.body"
	},
	{
		icon: r,
		title: "feature.water.title",
		body: "feature.water.body"
	},
	{
		icon: e,
		title: "feature.ai.title",
		body: "feature.ai.body"
	}
], $ = (e) => z`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d=${e}></path></svg>`, ke = class extends X {
	constructor(...e) {
		super(...e), this._loading = !1, this._localize = Q("en"), this._language = "";
	}
	static {
		this.properties = {
			hass: { attribute: !1 },
			narrow: { type: Boolean },
			panel: { attribute: !1 },
			_info: { state: !0 },
			_error: { state: !0 }
		};
	}
	willUpdate(e) {
		if (!e.has("hass") || !this.hass) return;
		let t = this.hass.locale?.language ?? this.hass.language;
		t !== this._language && (this._language = t, this._localize = Q(t)), this.toggleAttribute("dark", !!this.hass.themes?.darkMode), this._info || this._error || this._loading || this._load();
	}
	async _load() {
		this._loading = !0, this._error = void 0;
		try {
			this._info = await be(this.hass);
		} catch (e) {
			this._error = xe(e);
		} finally {
			this._loading = !1;
		}
	}
	_toggleSidebar() {
		this.dispatchEvent(new Event("hass-toggle-menu", {
			bubbles: !0,
			composed: !0
		}));
	}
	render() {
		let e = this._localize, t = this._info?.garden_name ?? this.panel?.title ?? "Plant Garden";
		return z`
      <header class="toolbar">
        ${this.narrow ? z`<button
                class="icon-button"
                @click=${this._toggleSidebar}
                aria-label=${e("panel.open_sidebar")}
                title=${e("panel.open_sidebar")}
              >
                ${$("M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z")}
              </button>` : V}
        <h1>${t}</h1>
      </header>
      <main>${this._renderBody(e, t)}</main>
    `;
	}
	_renderBody(e, t) {
		return this._error ? z`
        <section class="card state" role="alert">
          ${$("M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z")}
          <h2>${e("panel.error_title")}</h2>
          <p class="muted">${this._error}</p>
          <p class="muted">${e("panel.error_hint")}</p>
          <button class="button" @click=${this._load}>
            ${$("M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z")} ${e("panel.retry")}
          </button>
        </section>
      ` : this._info ? z`
      <section class="hero card">
        ${Se}
        <div class="hero-text">
          <h2>${e("welcome.title", { garden: t })}</h2>
          <p class="muted">${e("welcome.lead")}</p>
        </div>
      </section>
      <section class="features" aria-label=${e("feature.coming")}>
        ${Oe.map((t) => z`
            <article class="card feature">
              <div class="feature-icon">${$(t.icon)}</div>
              <h3>${e(t.title)}</h3>
              <p class="muted">${e(t.body)}</p>
              <span class="badge">${e("feature.coming")}</span>
            </article>
          `)}
      </section>
      <footer class="muted">
        ${e("meta.version", { version: this._info.version })} · ${e("meta.connected")}
      </footer>
    ` : z`<p class="muted loading" aria-live="polite">${e("panel.loading")}</p>`;
	}
	static {
		this.styles = [
			De,
			Ce,
			u`
      :host {
        display: block;
        min-height: 100%;
        background: var(--pg-bg);
        color: var(--pg-text);
        font-family: var(--pg-font);
      }
      .toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        height: var(--header-height, 56px);
        padding: 0 16px;
        background: var(--app-header-background-color, var(--pg-accent));
        color: var(--app-header-text-color, #fff);
        border-bottom: var(--app-header-border-bottom, none);
        box-sizing: border-box;
      }
      .toolbar h1 {
        margin: 0;
        font-size: 20px;
        font-weight: 400;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .icon {
        width: 24px;
        height: 24px;
        fill: currentColor;
        flex: none;
      }
      .icon-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        margin-left: -8px;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: inherit;
        cursor: pointer;
      }
      .icon-button:hover {
        background: rgba(255, 255, 255, 0.12);
      }
      .icon-button:focus-visible,
      .button:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
      }
      main {
        max-width: 1040px;
        margin: 0 auto;
        padding: 24px 16px 40px;
        display: grid;
        gap: 16px;
      }
      .card {
        background: var(--pg-surface);
        border-radius: var(--pg-radius);
        box-shadow: var(--pg-shadow);
      }
      .muted {
        color: var(--pg-text-muted);
      }
      .loading {
        text-align: center;
        padding: 48px 0;
      }
      .hero {
        overflow: hidden;
        display: grid;
      }
      .hero svg {
        display: block;
        width: 100%;
        height: auto;
        max-height: 260px;
      }
      .hero-text {
        padding: 8px 24px 24px;
      }
      .hero h2 {
        margin: 8px 0;
        font-size: 26px;
        font-weight: 500;
      }
      .hero p {
        margin: 0;
        max-width: 64ch;
        line-height: 1.5;
      }
      .features {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
      }
      .feature {
        position: relative;
        padding: 20px;
        transition:
          transform 160ms ease,
          box-shadow 160ms ease;
      }
      .feature:hover {
        transform: translateY(-2px);
      }
      .feature h3 {
        margin: 12px 0 4px;
        font-size: 16px;
        font-weight: 500;
      }
      .feature p {
        margin: 0 0 12px;
        line-height: 1.45;
        font-size: 14px;
      }
      .feature-icon {
        display: inline-flex;
        padding: 10px;
        border-radius: 12px;
        background: var(--pg-leaf-soft);
        color: var(--pg-leaf);
      }
      .badge {
        display: inline-block;
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 12px;
        background: color-mix(in srgb, var(--pg-accent) 14%, transparent);
        color: var(--pg-accent);
      }
      .state {
        padding: 32px 24px;
        text-align: center;
        display: grid;
        justify-items: center;
        gap: 4px;
      }
      .state > .icon {
        width: 40px;
        height: 40px;
        color: var(--error-color, #db4437);
      }
      .state h2 {
        margin: 8px 0 4px;
        font-weight: 500;
      }
      .button {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 12px;
        padding: 8px 16px;
        border: none;
        border-radius: 999px;
        background: var(--pg-accent);
        color: var(--text-primary-color, #fff);
        font: inherit;
        cursor: pointer;
      }
      .button .icon {
        width: 18px;
        height: 18px;
      }
      footer {
        text-align: center;
        font-size: 13px;
      }
      @media (prefers-reduced-motion: reduce) {
        .feature {
          transition: none;
        }
        .feature:hover {
          transform: none;
        }
      }
    `
		];
	}
};
// src/main.ts
customElements.get("plant-garden-panel") || customElements.define("plant-garden-panel", ke);
