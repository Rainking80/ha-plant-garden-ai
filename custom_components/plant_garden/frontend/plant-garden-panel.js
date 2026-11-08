// node_modules/@mdi/js/mdi.js
var e = "M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z", t = "M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19M8,9H16V19H8V9M15.5,4L14.5,3H9.5L8.5,4H5V6H19V4H15.5Z", n = "M13 19C13 19.7 13.13 20.37 13.35 21H5C3.9 21 3 20.11 3 19V5C3 3.9 3.9 3 5 3H19C20.11 3 21 3.9 21 5V13.35C20.37 13.13 19.7 13 19 13V5H5V19H13M13.96 12.29L11.21 15.83L9.25 13.47L6.5 17H13.35C13.75 15.88 14.47 14.91 15.4 14.21L13.96 12.29M20 18V15H18V18H15V20H18V23H20V20H23V18H20Z", r = "M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z", i = "M2,22V20C2,20 7,18 12,18C17,18 22,20 22,20V22H2M11.3,9.1C10.1,5.2 4,6.1 4,6.1C4,6.1 4.2,13.9 9.9,12.7C9.5,9.8 8,9 8,9C10.8,9 11,12.4 11,12.4V17C11.3,17 11.7,17 12,17C12.3,17 12.7,17 13,17V12.8C13,12.8 13,8.9 16,7.9C16,7.9 14,10.9 14,12.9C21,13.6 21,4 21,4C21,4 12.1,3 11.3,9.1Z", a = "M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z", o = globalThis, s = o.ShadowRoot && (o.ShadyCSS === void 0 || o.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, c = Symbol(), l = /* @__PURE__ */ new WeakMap(), u = class {
	constructor(e, t, n) {
		if (this._$cssResult$ = !0, n !== c) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
		this.cssText = e, this.t = t;
	}
	get styleSheet() {
		let e = this.o, t = this.t;
		if (s && e === void 0) {
			let n = t !== void 0 && t.length === 1;
			n && (e = l.get(t)), e === void 0 && ((this.o = e = new CSSStyleSheet()).replaceSync(this.cssText), n && l.set(t, e));
		}
		return e;
	}
	toString() {
		return this.cssText;
	}
}, d = (e) => new u(typeof e == "string" ? e : e + "", void 0, c), f = (e, ...t) => new u(e.length === 1 ? e[0] : t.reduce((t, n, r) => t + ((e) => {
	if (!0 === e._$cssResult$) return e.cssText;
	if (typeof e == "number") return e;
	throw Error("Value passed to 'css' function must be a 'css' function result: " + e + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
})(n) + e[r + 1], e[0]), e, c), p = (e, t) => {
	if (s) e.adoptedStyleSheets = t.map((e) => e instanceof CSSStyleSheet ? e : e.styleSheet);
	else for (let n of t) {
		let t = document.createElement("style"), r = o.litNonce;
		r !== void 0 && t.setAttribute("nonce", r), t.textContent = n.cssText, e.appendChild(t);
	}
}, m = s ? (e) => e : (e) => e instanceof CSSStyleSheet ? ((e) => {
	let t = "";
	for (let n of e.cssRules) t += n.cssText;
	return d(t);
})(e) : e, { is: ee, defineProperty: te, getOwnPropertyDescriptor: ne, getOwnPropertyNames: re, getOwnPropertySymbols: ie, getPrototypeOf: ae } = Object, h = globalThis, oe = h.trustedTypes, se = oe ? oe.emptyScript : "", ce = h.reactiveElementPolyfillSupport, g = (e, t) => e, _ = {
	toAttribute(e, t) {
		switch (t) {
			case Boolean:
				e = e ? se : null;
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
}, le = (e, t) => !ee(e, t), ue = {
	attribute: !0,
	type: String,
	converter: _,
	reflect: !1,
	useDefault: !1,
	hasChanged: le
};
Symbol.metadata ??= Symbol("metadata"), h.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
var v = class extends HTMLElement {
	static addInitializer(e) {
		this._$Ei(), (this.l ??= []).push(e);
	}
	static get observedAttributes() {
		return this.finalize(), this._$Eh && [...this._$Eh.keys()];
	}
	static createProperty(e, t = ue) {
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
		return this.elementProperties.get(e) ?? ue;
	}
	static _$Ei() {
		if (this.hasOwnProperty(g("elementProperties"))) return;
		let e = ae(this);
		e.finalize(), e.l !== void 0 && (this.l = [...e.l]), this.elementProperties = new Map(e.elementProperties);
	}
	static finalize() {
		if (this.hasOwnProperty(g("finalized"))) return;
		if (this.finalized = !0, this._$Ei(), this.hasOwnProperty(g("properties"))) {
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
			for (let e of n) t.unshift(m(e));
		} else e !== void 0 && t.push(m(e));
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
		return p(e, this.constructor.elementStyles), e;
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
			let i = (n.converter?.toAttribute === void 0 ? _ : n.converter).toAttribute(t, n.type);
			this._$Em = e, i == null ? this.removeAttribute(r) : this.setAttribute(r, i), this._$Em = null;
		}
	}
	_$AK(e, t) {
		let n = this.constructor, r = n._$Eh.get(e);
		if (r !== void 0 && this._$Em !== r) {
			let e = n.getPropertyOptions(r), i = typeof e.converter == "function" ? { fromAttribute: e.converter } : e.converter?.fromAttribute === void 0 ? _ : e.converter;
			this._$Em = r;
			let a = i.fromAttribute(t, e.type);
			this[r] = a ?? this._$Ej?.get(r) ?? a, this._$Em = null;
		}
	}
	requestUpdate(e, t, n, r = !1, i) {
		if (e !== void 0) {
			let a = this.constructor;
			if (!1 === r && (i = this[e]), n ??= a.getPropertyOptions(e), !((n.hasChanged ?? le)(i, t) || n.useDefault && n.reflect && i === this._$Ej?.get(e) && !this.hasAttribute(a._$Eu(e, n)))) return;
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
v.elementStyles = [], v.shadowRootOptions = { mode: "open" }, v[g("elementProperties")] = /* @__PURE__ */ new Map(), v[g("finalized")] = /* @__PURE__ */ new Map(), ce?.({ ReactiveElement: v }), (h.reactiveElementVersions ??= []).push("2.1.2");
// node_modules/lit-html/lit-html.js
var de = globalThis, fe = (e) => e, y = de.trustedTypes, pe = y ? y.createPolicy("lit-html", { createHTML: (e) => e }) : void 0, me = "$lit$", b = `lit$${Math.random().toFixed(9).slice(2)}$`, he = "?" + b, ge = `<${he}>`, x = document, S = () => x.createComment(""), C = (e) => e === null || typeof e != "object" && typeof e != "function", _e = Array.isArray, ve = (e) => _e(e) || typeof e?.[Symbol.iterator] == "function", w = "[ 	\n\f\r]", T = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, ye = /-->/g, be = />/g, E = RegExp(`>|${w}(?:([^\\s"'>=/]+)(${w}*=${w}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`, "g"), xe = /'/g, Se = /"/g, Ce = /^(?:script|style|textarea|title)$/i, we = (e) => (t, ...n) => ({
	_$litType$: e,
	strings: t,
	values: n
}), D = we(1), O = we(2), k = Symbol.for("lit-noChange"), A = Symbol.for("lit-nothing"), Te = /* @__PURE__ */ new WeakMap(), j = x.createTreeWalker(x, 129);
function Ee(e, t) {
	if (!_e(e) || !e.hasOwnProperty("raw")) throw Error("invalid template strings array");
	return pe === void 0 ? t : pe.createHTML(t);
}
var De = (e, t) => {
	let n = e.length - 1, r = [], i, a = t === 2 ? "<svg>" : t === 3 ? "<math>" : "", o = T;
	for (let t = 0; t < n; t++) {
		let n = e[t], s, c, l = -1, u = 0;
		for (; u < n.length && (o.lastIndex = u, c = o.exec(n), c !== null);) u = o.lastIndex, o === T ? c[1] === "!--" ? o = ye : c[1] === void 0 ? c[2] === void 0 ? c[3] !== void 0 && (o = E) : (Ce.test(c[2]) && (i = RegExp("</" + c[2], "g")), o = E) : o = be : o === E ? c[0] === ">" ? (o = i ?? T, l = -1) : c[1] === void 0 ? l = -2 : (l = o.lastIndex - c[2].length, s = c[1], o = c[3] === void 0 ? E : c[3] === "\"" ? Se : xe) : o === Se || o === xe ? o = E : o === ye || o === be ? o = T : (o = E, i = void 0);
		let d = o === E && e[t + 1].startsWith("/>") ? " " : "";
		a += o === T ? n + ge : l >= 0 ? (r.push(s), n.slice(0, l) + me + n.slice(l) + b + d) : n + b + (l === -2 ? t : d);
	}
	return [Ee(e, a + (e[n] || "<?>") + (t === 2 ? "</svg>" : t === 3 ? "</math>" : "")), r];
}, M = class e {
	constructor({ strings: t, _$litType$: n }, r) {
		let i;
		this.parts = [];
		let a = 0, o = 0, s = t.length - 1, c = this.parts, [l, u] = De(t, n);
		if (this.el = e.createElement(l, r), j.currentNode = this.el.content, n === 2 || n === 3) {
			let e = this.el.content.firstChild;
			e.replaceWith(...e.childNodes);
		}
		for (; (i = j.nextNode()) !== null && c.length < s;) {
			if (i.nodeType === 1) {
				if (i.hasAttributes()) for (let e of i.getAttributeNames()) if (e.endsWith(me)) {
					let t = u[o++], n = i.getAttribute(e).split(b), r = /([.?@])?(.*)/.exec(t);
					c.push({
						type: 1,
						index: a,
						name: r[2],
						strings: n,
						ctor: r[1] === "." ? ke : r[1] === "?" ? Ae : r[1] === "@" ? je : F
					}), i.removeAttribute(e);
				} else e.startsWith(b) && (c.push({
					type: 6,
					index: a
				}), i.removeAttribute(e));
				if (Ce.test(i.tagName)) {
					let e = i.textContent.split(b), t = e.length - 1;
					if (t > 0) {
						i.textContent = y ? y.emptyScript : "";
						for (let n = 0; n < t; n++) i.append(e[n], S()), j.nextNode(), c.push({
							type: 2,
							index: ++a
						});
						i.append(e[t], S());
					}
				}
			} else if (i.nodeType === 8) {
				if (i.data === he) c.push({
					type: 2,
					index: a
				});
				else {
					let e = -1;
					for (; (e = i.data.indexOf(b, e + 1)) !== -1;) c.push({
						type: 7,
						index: a
					}), e += b.length - 1;
				}
			}
			a++;
		}
	}
	static createElement(e, t) {
		let n = x.createElement("template");
		return n.innerHTML = e, n;
	}
};
function N(e, t, n = e, r) {
	if (t === k) return t;
	let i = r === void 0 ? n._$Cl : n._$Co?.[r], a = C(t) ? void 0 : t._$litDirective$;
	return i?.constructor !== a && (i?._$AO?.(!1), a === void 0 ? i = void 0 : (i = new a(e), i._$AT(e, n, r)), r === void 0 ? n._$Cl = i : (n._$Co ??= [])[r] = i), i !== void 0 && (t = N(e, i._$AS(e, t.values), i, r)), t;
}
var Oe = class {
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
		let { el: { content: t }, parts: n } = this._$AD, r = (e?.creationScope ?? x).importNode(t, !0);
		j.currentNode = r;
		let i = j.nextNode(), a = 0, o = 0, s = n[0];
		for (; s !== void 0;) {
			if (a === s.index) {
				let t;
				s.type === 2 ? t = new P(i, i.nextSibling, this, e) : s.type === 1 ? t = new s.ctor(i, s.name, s.strings, this, e) : s.type === 6 && (t = new Me(i, this, e)), this._$AV.push(t), s = n[++o];
			}
			a !== s?.index && (i = j.nextNode(), a++);
		}
		return j.currentNode = x, r;
	}
	p(e) {
		let t = 0;
		for (let n of this._$AV) n !== void 0 && (n.strings === void 0 ? n._$AI(e[t]) : (n._$AI(e, n, t), t += n.strings.length - 2)), t++;
	}
}, P = class e {
	get _$AU() {
		return this._$AM?._$AU ?? this._$Cv;
	}
	constructor(e, t, n, r) {
		this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = e, this._$AB = t, this._$AM = n, this.options = r, this._$Cv = r?.isConnected ?? !0;
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
		e = N(this, e, t), C(e) ? e === A || e == null || e === "" ? (this._$AH !== A && this._$AR(), this._$AH = A) : e !== this._$AH && e !== k && this._(e) : e._$litType$ === void 0 ? e.nodeType === void 0 ? ve(e) ? this.k(e) : this._(e) : this.T(e) : this.$(e);
	}
	O(e) {
		return this._$AA.parentNode.insertBefore(e, this._$AB);
	}
	T(e) {
		this._$AH !== e && (this._$AR(), this._$AH = this.O(e));
	}
	_(e) {
		this._$AH !== A && C(this._$AH) ? this._$AA.nextSibling.data = e : this.T(x.createTextNode(e)), this._$AH = e;
	}
	$(e) {
		let { values: t, _$litType$: n } = e, r = typeof n == "number" ? this._$AC(e) : (n.el === void 0 && (n.el = M.createElement(Ee(n.h, n.h[0]), this.options)), n);
		if (this._$AH?._$AD === r) this._$AH.p(t);
		else {
			let e = new Oe(r, this), n = e.u(this.options);
			e.p(t), this.T(n), this._$AH = e;
		}
	}
	_$AC(e) {
		let t = Te.get(e.strings);
		return t === void 0 && Te.set(e.strings, t = new M(e)), t;
	}
	k(t) {
		_e(this._$AH) || (this._$AH = [], this._$AR());
		let n = this._$AH, r, i = 0;
		for (let a of t) i === n.length ? n.push(r = new e(this.O(S()), this.O(S()), this, this.options)) : r = n[i], r._$AI(a), i++;
		i < n.length && (this._$AR(r && r._$AB.nextSibling, i), n.length = i);
	}
	_$AR(e = this._$AA.nextSibling, t) {
		for (this._$AP?.(!1, !0, t); e !== this._$AB;) {
			let t = fe(e).nextSibling;
			fe(e).remove(), e = t;
		}
	}
	setConnected(e) {
		this._$AM === void 0 && (this._$Cv = e, this._$AP?.(e));
	}
}, F = class {
	get tagName() {
		return this.element.tagName;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	constructor(e, t, n, r, i) {
		this.type = 1, this._$AH = A, this._$AN = void 0, this.element = e, this.name = t, this._$AM = r, this.options = i, n.length > 2 || n[0] !== "" || n[1] !== "" ? (this._$AH = Array(n.length - 1).fill(/* @__PURE__ */ new String()), this.strings = n) : this._$AH = A;
	}
	_$AI(e, t = this, n, r) {
		let i = this.strings, a = !1;
		if (i === void 0) e = N(this, e, t, 0), a = !C(e) || e !== this._$AH && e !== k, a && (this._$AH = e);
		else {
			let r = e, o, s;
			for (e = i[0], o = 0; o < i.length - 1; o++) s = N(this, r[n + o], t, o), s === k && (s = this._$AH[o]), a ||= !C(s) || s !== this._$AH[o], s === A ? e = A : e !== A && (e += (s ?? "") + i[o + 1]), this._$AH[o] = s;
		}
		a && !r && this.j(e);
	}
	j(e) {
		e === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, e ?? "");
	}
}, ke = class extends F {
	constructor() {
		super(...arguments), this.type = 3;
	}
	j(e) {
		this.element[this.name] = e === A ? void 0 : e;
	}
}, Ae = class extends F {
	constructor() {
		super(...arguments), this.type = 4;
	}
	j(e) {
		this.element.toggleAttribute(this.name, !!e && e !== A);
	}
}, je = class extends F {
	constructor(e, t, n, r, i) {
		super(e, t, n, r, i), this.type = 5;
	}
	_$AI(e, t = this) {
		if ((e = N(this, e, t, 0) ?? A) === k) return;
		let n = this._$AH, r = e === A && n !== A || e.capture !== n.capture || e.once !== n.once || e.passive !== n.passive, i = e !== A && (n === A || r);
		r && this.element.removeEventListener(this.name, this, n), i && this.element.addEventListener(this.name, this, e), this._$AH = e;
	}
	handleEvent(e) {
		typeof this._$AH == "function" ? this._$AH.call(this.options?.host ?? this.element, e) : this._$AH.handleEvent(e);
	}
}, Me = class {
	constructor(e, t, n) {
		this.element = e, this.type = 6, this._$AN = void 0, this._$AM = t, this.options = n;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	_$AI(e) {
		N(this, e);
	}
}, Ne = de.litHtmlPolyfillSupport;
Ne?.(M, P), (de.litHtmlVersions ??= []).push("3.3.3");
var Pe = (e, t, n) => {
	let r = n?.renderBefore ?? t, i = r._$litPart$;
	if (i === void 0) {
		let e = n?.renderBefore ?? null;
		r._$litPart$ = i = new P(t.insertBefore(S(), e), e, void 0, n ?? {});
	}
	return i._$AI(e), i;
}, I = globalThis, L = class extends v {
	constructor() {
		super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
	}
	createRenderRoot() {
		let e = super.createRenderRoot();
		return this.renderOptions.renderBefore ??= e.firstChild, e;
	}
	update(e) {
		let t = this.render();
		this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(e), this._$Do = Pe(t, this.renderRoot, this.renderOptions);
	}
	connectedCallback() {
		super.connectedCallback(), this._$Do?.setConnected(!0);
	}
	disconnectedCallback() {
		super.disconnectedCallback(), this._$Do?.setConnected(!1);
	}
	render() {
		return k;
	}
};
L._$litElement$ = !0, L.finalized = !0, I.litElementHydrateSupport?.({ LitElement: L });
var Fe = I.litElementPolyfillSupport;
Fe?.({ LitElement: L }), (I.litElementVersions ??= []).push("4.2.2");
// src/api/client.ts
var R = "plant_garden", Ie = "/api/plant_garden/photos";
function Le(e) {
	return e.callWS({ type: `${R}/info` });
}
function z(e) {
	return e instanceof Error ? e.message : typeof e == "object" && e && "message" in e ? String(e.message) : String(e);
}
async function Re(e) {
	return (await e.callWS({ type: `${R}/plants/list` })).plants;
}
function ze(e, t) {
	return e.callWS({
		type: `${R}/plants/get`,
		plant_id: t
	});
}
function Be(e, t) {
	return e.callWS({
		type: `${R}/plants/create`,
		...t
	});
}
function Ve(e, t, n) {
	return e.callWS({
		type: `${R}/plants/update`,
		plant_id: t,
		...n
	});
}
async function He(e, t) {
	await e.callWS({
		type: `${R}/plants/delete`,
		plant_id: t
	});
}
function Ue(e, t, n) {
	return e.callWS({
		type: `${R}/plants/set_cover`,
		plant_id: t,
		photo_id: n
	});
}
function We(e, t) {
	return e.connection.subscribeMessage(t, { type: `${R}/subscribe` });
}
var Ge = class extends Error {
	constructor(e, t, n) {
		super(e), this.code = t, this.status = n;
	}
};
async function Ke(e, t) {
	let n = new FormData();
	n.append("plant_id", t.plantId), t.takenAt && n.append("taken_at", t.takenAt), t.tags?.length && n.append("tags", t.tags.join(",")), t.note && n.append("note", t.note), n.append("file", t.file, t.filename);
	let r = await e.fetchWithAuth(Ie, {
		method: "POST",
		body: n
	});
	if (!r.ok) {
		let e = null, t = r.statusText;
		try {
			let n = await r.json();
			e = n.code ?? null, t = n.message ?? t;
		} catch {}
		throw new Ge(t, e, r.status);
	}
	return await r.json();
}
function qe(e, t, n) {
	return e.callWS({
		type: `${R}/photos/update`,
		photo_id: t,
		...n
	});
}
async function Je(e, t) {
	await e.callWS({
		type: `${R}/photos/delete`,
		photo_id: t
	});
}
function Ye(e, t, n) {
	return e.callWS({
		type: `${R}/measurements/add`,
		plant_id: t,
		...n
	});
}
async function Xe(e, t) {
	await e.callWS({
		type: `${R}/measurements/delete`,
		measurement_id: t
	});
}
// src/i18n/de.ts
var Ze = {
	"common.cancel": "Abbrechen",
	"common.save": "Speichern",
	"common.delete": "Löschen",
	"common.close": "Schließen",
	"common.not_set": "Nicht angegeben",
	"panel.open_sidebar": "Seitenleiste öffnen",
	"panel.back": "Zurück",
	"panel.loading": "Dein Garten wird geladen …",
	"panel.error_title": "Plant Garden ist nicht erreichbar",
	"panel.error_hint": "Im Home-Assistant-Protokoll findest du Meldungen von plant_garden.",
	"panel.retry": "Erneut versuchen",
	"plants.title": "Pflanzen",
	"plants.add": "Pflanze hinzufügen",
	"plants.search": "Pflanzen suchen",
	"plants.filter_all": "Alle",
	"plants.empty_title": "Willkommen in {garden}",
	"plants.empty_body": "Lege deine erste Pflanze an. Mit einem Foto erkennst du sie später im Gartenplan wieder.",
	"plants.no_results": "Keine Pflanze passt zu deiner Suche.",
	"plants.photos_one": "{n} Foto",
	"plants.photos_other": "{n} Fotos",
	"field.name": "Name",
	"field.scientific_name": "Botanischer Name",
	"field.variety": "Sorte",
	"field.family": "Familie",
	"field.notes": "Notizen",
	"field.category": "Kategorie",
	"field.location_type": "Standort",
	"field.light": "Licht",
	"field.water_need": "Wasserbedarf",
	"field.soil_type": "Boden",
	"field.status": "Zustand",
	"field.min_temperature_c": "Winterhart bis (°C)",
	"field.root_depth_cm": "Wurzeltiefe (cm)",
	"field.planted_on": "Gepflanzt am",
	"field.age": "Alter",
	"field.tags": "Schlagworte",
	"field.height": "Höhe",
	"field.width": "Breite",
	"form.create_title": "Neue Pflanze",
	"form.edit_title": "{name} bearbeiten",
	"form.create": "Pflanze anlegen",
	"form.section_basics": "Name",
	"form.section_classification": "Einordnung",
	"form.section_age": "Alter",
	"form.section_more": "Weiteres",
	"form.section_start": "Fotos und aktuelle Größe",
	"form.age_years": "Jahre",
	"form.age_months": "Monate",
	"form.age_on": "Stand",
	"form.age_hint": "Wie alt war die Pflanze an diesem Tag ungefähr? Ergänzt das Pflanzdatum, z. B. bei gekauften Sträuchern.",
	"form.tags_hint": "Mit Komma trennen",
	"form.photos": "Fotos",
	"form.photos_hint": "Optional. Weitere Fotos kannst du jederzeit ergänzen.",
	"form.photos_selected": "{n} ausgewählt",
	"form.height_cm": "Höhe (cm)",
	"form.width_cm": "Breite (cm)",
	"form.name_required": "Bitte gib einen Namen ein.",
	"form.continue": "Weiter zu {name}",
	"category.perennial": "Staude",
	"category.shrub": "Strauch",
	"category.tree": "Baum",
	"category.hedge": "Hecke",
	"category.climber": "Kletterpflanze",
	"category.grass": "Ziergras",
	"category.lawn": "Rasen",
	"category.bulb": "Zwiebelpflanze",
	"category.annual": "Einjährige",
	"category.vegetable": "Gemüse",
	"category.herb": "Kräuter",
	"category.fruit": "Obst",
	"category.succulent": "Sukkulente",
	"category.potted": "Kübelpflanze",
	"category.other": "Sonstige",
	"location.bed": "Beet",
	"location.raised_bed": "Hochbeet",
	"location.pot": "Topf",
	"location.lawn": "Rasenfläche",
	"location.greenhouse": "Gewächshaus",
	"location.covered": "Überdacht (kein Regen)",
	"light.full_sun": "Sonne",
	"light.partial_shade": "Halbschatten",
	"light.shade": "Schatten",
	"water.very_low": "Sehr gering",
	"water.low": "Gering",
	"water.moderate": "Mittel",
	"water.high": "Hoch",
	"soil.sand": "Sand",
	"soil.loamy_sand": "Lehmiger Sand",
	"soil.sandy_loam": "Sandiger Lehm",
	"soil.loam": "Lehm",
	"soil.silt_loam": "Schluffiger Lehm",
	"soil.clay_loam": "Toniger Lehm",
	"soil.clay": "Ton",
	"soil.potting_mix": "Blumenerde",
	"status.healthy": "Gesund",
	"status.watch": "Beobachten",
	"status.problem": "Problem",
	"status.dead": "Eingegangen",
	"status.removed": "Entfernt",
	"age.under_month": "unter einem Monat",
	"age.year_one": "{n} Jahr",
	"age.year_other": "{n} Jahre",
	"age.month_one": "{n} Monat",
	"age.month_other": "{n} Monate",
	"detail.edit": "Bearbeiten",
	"detail.delete": "Pflanze löschen",
	"detail.add_photos": "Fotos hinzufügen",
	"detail.delete_title": "{name} löschen?",
	"detail.delete_body": "Alle Fotos und Messungen dieser Pflanze werden ebenfalls gelöscht.",
	"detail.facts": "Steckbrief",
	"detail.notes": "Notizen",
	"detail.growth": "Wachstum",
	"detail.photos": "Fotos",
	"detail.no_photos": "Noch keine Fotos. Fotos dokumentieren das Wachstum und helfen, Probleme zu erkennen.",
	"detail.no_measurements": "Noch keine Messungen.",
	"detail.add_measurement": "Messung hinzufügen",
	"detail.measured_on": "Datum",
	"detail.add": "Hinzufügen",
	"detail.measurement_needs_value": "Gib eine Höhe oder eine Breite an.",
	"detail.delete_measurement": "Messung löschen",
	"detail.frost_to": "bis {temp} °C",
	"detail.not_found": "Diese Pflanze gibt es nicht mehr.",
	"detail.back_to_list": "Zur Pflanzenliste",
	"detail.drop_photos": "Fotos hier ablegen",
	"detail.uploading": "Lade Foto {current} von {total} hoch …",
	"detail.cover": "Titelbild",
	"source.user": "Von dir eingetragen",
	"source.ai": "KI-Vorschlag",
	"source.ai_confidence": "KI-Vorschlag ({confidence} %)",
	"source.provider": "Vom Bestimmungsdienst",
	"source.default": "Standardwert",
	"upload.invalid_image": "keine gültige Bilddatei",
	"upload.unsupported_format": "dieses Bildformat wird nicht unterstützt",
	"upload.image_too_large": "das Bild hat zu viele Pixel",
	"upload.too_large": "die Datei ist zu groß (max. 20 MB)",
	"upload.failed": "Hochladen fehlgeschlagen",
	"viewer.previous": "Vorheriges Foto",
	"viewer.next": "Nächstes Foto",
	"viewer.set_cover": "Als Titelbild verwenden",
	"viewer.is_cover": "Titelbild",
	"viewer.delete": "Foto löschen",
	"viewer.delete_confirm": "Dieses Foto löschen?",
	"viewer.tags": "Schlagworte",
	"viewer.add_tag": "Schlagwort hinzufügen",
	"viewer.note": "Notiz",
	"viewer.open_original": "Original öffnen",
	"viewer.taken": "Aufgenommen am {date}",
	"tag.development": "Entwicklung",
	"tag.problem": "Problem",
	"tag.flowering": "Blüte",
	"tag.harvest": "Ernte",
	"chart.label": "Höhe und Breite im Verlauf"
}, Qe = {
	"common.cancel": "Cancel",
	"common.save": "Save",
	"common.delete": "Delete",
	"common.close": "Close",
	"common.not_set": "Not set",
	"panel.open_sidebar": "Open sidebar",
	"panel.back": "Back",
	"panel.loading": "Loading your garden…",
	"panel.error_title": "Plant Garden is not reachable",
	"panel.error_hint": "Check the Home Assistant log for messages from plant_garden.",
	"panel.retry": "Try again",
	"plants.title": "Plants",
	"plants.add": "Add plant",
	"plants.search": "Search plants",
	"plants.filter_all": "All",
	"plants.empty_title": "Welcome to {garden}",
	"plants.empty_body": "Add your first plant. A photo helps you recognise it later on the garden plan.",
	"plants.no_results": "No plant matches your search.",
	"plants.photos_one": "{n} photo",
	"plants.photos_other": "{n} photos",
	"field.name": "Name",
	"field.scientific_name": "Botanical name",
	"field.variety": "Variety",
	"field.family": "Family",
	"field.notes": "Notes",
	"field.category": "Category",
	"field.location_type": "Location",
	"field.light": "Light",
	"field.water_need": "Water need",
	"field.soil_type": "Soil",
	"field.status": "Status",
	"field.min_temperature_c": "Hardy down to (°C)",
	"field.root_depth_cm": "Root depth (cm)",
	"field.planted_on": "Planted on",
	"field.age": "Age",
	"field.tags": "Tags",
	"field.height": "Height",
	"field.width": "Width",
	"form.create_title": "New plant",
	"form.edit_title": "Edit {name}",
	"form.create": "Add plant",
	"form.section_basics": "Name",
	"form.section_classification": "Classification",
	"form.section_age": "Age",
	"form.section_more": "More",
	"form.section_start": "Photos and current size",
	"form.age_years": "Years",
	"form.age_months": "Months",
	"form.age_on": "On",
	"form.age_hint": "How old was the plant on that day, roughly? Used together with the planting date.",
	"form.tags_hint": "Separate with commas",
	"form.photos": "Photos",
	"form.photos_hint": "Optional. You can add more photos at any time.",
	"form.photos_selected": "{n} selected",
	"form.height_cm": "Height (cm)",
	"form.width_cm": "Width (cm)",
	"form.name_required": "Please enter a name.",
	"form.continue": "Continue to {name}",
	"category.perennial": "Perennial",
	"category.shrub": "Shrub",
	"category.tree": "Tree",
	"category.hedge": "Hedge",
	"category.climber": "Climber",
	"category.grass": "Ornamental grass",
	"category.lawn": "Lawn",
	"category.bulb": "Bulb",
	"category.annual": "Annual",
	"category.vegetable": "Vegetable",
	"category.herb": "Herb",
	"category.fruit": "Fruit",
	"category.succulent": "Succulent",
	"category.potted": "Potted plant",
	"category.other": "Other",
	"location.bed": "Bed",
	"location.raised_bed": "Raised bed",
	"location.pot": "Pot",
	"location.lawn": "Lawn",
	"location.greenhouse": "Greenhouse",
	"location.covered": "Covered (no rain)",
	"light.full_sun": "Full sun",
	"light.partial_shade": "Partial shade",
	"light.shade": "Shade",
	"water.very_low": "Very low",
	"water.low": "Low",
	"water.moderate": "Moderate",
	"water.high": "High",
	"soil.sand": "Sand",
	"soil.loamy_sand": "Loamy sand",
	"soil.sandy_loam": "Sandy loam",
	"soil.loam": "Loam",
	"soil.silt_loam": "Silt loam",
	"soil.clay_loam": "Clay loam",
	"soil.clay": "Clay",
	"soil.potting_mix": "Potting mix",
	"status.healthy": "Healthy",
	"status.watch": "Keep an eye on",
	"status.problem": "Problem",
	"status.dead": "Dead",
	"status.removed": "Removed",
	"age.under_month": "less than a month",
	"age.year_one": "{n} year",
	"age.year_other": "{n} years",
	"age.month_one": "{n} month",
	"age.month_other": "{n} months",
	"detail.edit": "Edit",
	"detail.delete": "Delete plant",
	"detail.add_photos": "Add photos",
	"detail.delete_title": "Delete {name}?",
	"detail.delete_body": "All photos and measurements of this plant are deleted as well.",
	"detail.facts": "Profile",
	"detail.notes": "Notes",
	"detail.growth": "Growth",
	"detail.photos": "Photos",
	"detail.no_photos": "No photos yet. Photos document growth and help to spot problems.",
	"detail.no_measurements": "No measurements yet.",
	"detail.add_measurement": "Add measurement",
	"detail.measured_on": "Date",
	"detail.add": "Add",
	"detail.measurement_needs_value": "Enter a height or a width.",
	"detail.delete_measurement": "Delete measurement",
	"detail.frost_to": "down to {temp} °C",
	"detail.not_found": "This plant no longer exists.",
	"detail.back_to_list": "Back to all plants",
	"detail.drop_photos": "Drop photos here",
	"detail.uploading": "Uploading photo {current} of {total}…",
	"detail.cover": "Cover photo",
	"source.user": "Entered by you",
	"source.ai": "AI suggestion",
	"source.ai_confidence": "AI suggestion ({confidence} %)",
	"source.provider": "From identification service",
	"source.default": "Default value",
	"upload.invalid_image": "not a valid image",
	"upload.unsupported_format": "this image format is not supported",
	"upload.image_too_large": "the image has too many pixels",
	"upload.too_large": "the file is too large (max. 20 MB)",
	"upload.failed": "upload failed",
	"viewer.previous": "Previous photo",
	"viewer.next": "Next photo",
	"viewer.set_cover": "Use as cover",
	"viewer.is_cover": "Cover photo",
	"viewer.delete": "Delete photo",
	"viewer.delete_confirm": "Delete this photo?",
	"viewer.tags": "Tags",
	"viewer.add_tag": "Add tag",
	"viewer.note": "Note",
	"viewer.open_original": "Open original",
	"viewer.taken": "Taken {date}",
	"tag.development": "Growth",
	"tag.problem": "Problem",
	"tag.flowering": "Flowering",
	"tag.harvest": "Harvest",
	"chart.label": "Height and width over time"
}, $e = {
	de: Ze,
	en: Qe
};
function et(e) {
	return $e[(e ?? "en").toLowerCase().split("-")[0] ?? "en"] ?? Qe;
}
function tt(e) {
	let t = et(e);
	return (e, n) => {
		let r = t[e] ?? Qe[e] ?? e;
		return n ? r.replace(/\{(\w+)\}/g, (e, t) => t in n ? String(n[t]) : e) : r;
	};
}
// src/components/base.ts
var B = class extends L {
	static {
		this.properties = { hass: { attribute: !1 } };
	}
	get language() {
		return this.hass?.locale?.language ?? this.hass?.language ?? "en";
	}
	get t() {
		let e = this.language;
		return this._localize && e === this._language || (this._language = e, this._localize = tt(e)), this._localize;
	}
	fire(e, t) {
		this.dispatchEvent(new CustomEvent(e, {
			detail: t,
			bubbles: !0,
			composed: !0
		}));
	}
}, V = (e, t) => t ? D`<svg class="icon" viewBox="0 0 24 24" role="img" aria-label=${t}>
        <path d=${e}></path>
      </svg>` : D`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d=${e}></path></svg>`;
function H(e, t) {
	customElements.get(e) || customElements.define(e, t);
}
// src/state/garden-store.ts
var nt = 36e5, rt = 150, it = class extends EventTarget {
	constructor(e) {
		super(), this._hass = e, this.plants = [], this.loaded = !1, this.lastRefresh = 0;
	}
	async connect() {
		if (!this._unsubscribe) {
			try {
				this._unsubscribe = await We(this._hass(), (e) => this._onChange(e));
			} catch (e) {
				this.error = z(e), this._emit("change");
				return;
			}
			await this.refresh();
		}
	}
	async disconnect() {
		clearTimeout(this._refreshTimer);
		let e = this._unsubscribe;
		this._unsubscribe = void 0;
		try {
			await e?.();
		} catch {}
	}
	get stale() {
		return Date.now() - this.lastRefresh > nt;
	}
	getPlant(e) {
		return this.plants.find((t) => t.id === e);
	}
	refresh() {
		return this._pending ??= this._load().finally(() => {
			this._pending = void 0;
		}), this._pending;
	}
	async _load() {
		try {
			this.plants = await Re(this._hass()), this.error = void 0, this.loaded = !0, this.lastRefresh = Date.now();
		} catch (e) {
			this.error = z(e);
		}
		this._emit("change");
	}
	_onChange(e) {
		this.dispatchEvent(new CustomEvent("plant-changed", { detail: e })), clearTimeout(this._refreshTimer), this._refreshTimer = setTimeout(() => void this.refresh(), rt);
	}
	_emit(e) {
		this.dispatchEvent(new Event(e));
	}
}, U = f`
  * {
    box-sizing: border-box;
  }
  .muted {
    color: var(--pg-text-muted);
  }
  .card {
    background: var(--pg-surface);
    border-radius: var(--pg-radius);
    box-shadow: var(--pg-shadow);
  }
  .icon {
    width: 24px;
    height: 24px;
    fill: currentColor;
    flex: none;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  /* ------------------------------------------------ buttons */
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 40px;
    padding: 8px 18px;
    border: none;
    border-radius: 999px;
    background: var(--pg-accent);
    color: var(--text-primary-color, #fff);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
    transition:
      filter 120ms ease,
      background 120ms ease;
  }
  .button:hover {
    filter: brightness(1.06);
  }
  .button:disabled {
    opacity: 0.5;
    cursor: default;
    filter: none;
  }
  .button.secondary {
    background: color-mix(in srgb, var(--pg-accent) 12%, transparent);
    color: var(--pg-accent);
  }
  .button.text {
    background: transparent;
    color: var(--pg-accent);
    padding: 8px 12px;
  }
  .button.danger {
    background: var(--error-color, #db4437);
    color: #fff;
  }
  .button.text.danger {
    background: transparent;
    color: var(--error-color, #db4437);
  }
  .button .icon {
    width: 18px;
    height: 18px;
  }
  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    cursor: pointer;
    flex: none;
  }
  .icon-button:hover {
    background: color-mix(in srgb, currentColor 10%, transparent);
  }
  .button:focus-visible,
  .icon-button:focus-visible,
  .chip:focus-visible {
    outline: 2px solid var(--pg-accent);
    outline-offset: 2px;
  }

  /* ------------------------------------------------ chips */
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    border: 1px solid var(--pg-divider);
    border-radius: 999px;
    background: transparent;
    color: var(--pg-text);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
  }
  .chip[aria-pressed="true"],
  .chip.selected {
    background: color-mix(in srgb, var(--pg-accent) 16%, transparent);
    border-color: transparent;
    color: var(--pg-accent);
    font-weight: 500;
  }
  .chip.static {
    cursor: default;
  }
  .chip .icon {
    width: 16px;
    height: 16px;
  }

  /* ------------------------------------------------ status */
  .status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  .status::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--status-color, var(--pg-leaf));
  }
  .status-healthy {
    --status-color: var(--success-color, #43a047);
  }
  .status-watch {
    --status-color: var(--warning-color, #ffa600);
  }
  .status-problem {
    --status-color: var(--error-color, #db4437);
  }
  .status-dead,
  .status-removed {
    --status-color: var(--disabled-text-color, #9e9e9e);
  }

  /* ------------------------------------------------ form fields */
  .field {
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .field > span {
    font-size: 12px;
    color: var(--pg-text-muted);
  }
  .field small {
    font-size: 12px;
    color: var(--pg-text-muted);
  }
  input,
  select,
  textarea {
    width: 100%;
    min-height: 40px;
    padding: 8px 12px;
    border: 1px solid var(--pg-divider);
    border-radius: 8px;
    background: var(--pg-input-bg);
    color: var(--pg-text);
    font: inherit;
  }
  textarea {
    min-height: 80px;
    resize: vertical;
  }
  input:focus,
  select:focus,
  textarea:focus {
    outline: 2px solid color-mix(in srgb, var(--pg-accent) 60%, transparent);
    outline-offset: -1px;
    border-color: transparent;
  }
  input[type="file"] {
    padding: 6px;
  }
  .error-text {
    color: var(--error-color, #db4437);
    font-size: 13px;
  }

  /* ------------------------------------------------ dialogs */
  dialog {
    width: min(640px, calc(100vw - 24px));
    max-height: calc(100vh - 24px);
    padding: 0;
    border: none;
    border-radius: 16px;
    background: var(--pg-surface);
    color: var(--pg-text);
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.3);
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.45);
  }
  dialog form {
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 24px);
  }
  .dialog-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 20px 8px;
  }
  .dialog-header h2 {
    flex: 1;
    margin: 0;
    font-size: 20px;
    font-weight: 500;
  }
  .dialog-body {
    padding: 8px 20px 16px;
    overflow: auto;
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px 16px;
    border-top: 1px solid var(--pg-divider);
  }
`, at = f`
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
    --pg-input-bg: color-mix(in srgb, var(--pg-text) 4%, var(--pg-surface));

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
`;
// src/util/navigate.ts
function W(e, t = {}) {
	t.replace ? history.replaceState(history.state, "", e) : history.pushState(null, "", e), window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: !!t.replace } }));
}
H("pg-confirm-dialog", class extends B {
	static {
		this.properties = { _request: { state: !0 } };
	}
	ask(e, t, n) {
		return this._request?.resolve(!1), new Promise((r) => {
			this._request = {
				title: e,
				body: t,
				confirm: n,
				resolve: r
			}, this.updateComplete.then(() => this.renderRoot.querySelector("dialog")?.showModal());
		});
	}
	_answer(e) {
		let t = this._request;
		this._request = void 0, this.renderRoot.querySelector("dialog")?.close(), t?.resolve(e);
	}
	render() {
		let e = this._request;
		return D`
      <dialog @cancel=${() => this._answer(!1)} aria-labelledby="title">
        ${e ? D`
                <div class="dialog-header"><h2 id="title">${e.title}</h2></div>
                <div class="dialog-body"><p>${e.body}</p></div>
                <div class="dialog-actions">
                  <button class="button text" @click=${() => this._answer(!1)}>
                    ${this.t("common.cancel")}
                  </button>
                  <button class="button danger" @click=${() => this._answer(!0)}>
                    ${e.confirm}
                  </button>
                </div>
              ` : ""}
      </dialog>
    `;
	}
	static {
		this.styles = [U, f`
      dialog {
        width: min(420px, calc(100vw - 24px));
      }
      p {
        margin: 0;
        line-height: 1.5;
      }
    `];
	}
});
// src/util/format.ts
function ot(e) {
	let [t, n, r] = e.split("-").map(Number);
	return new Date(t ?? 1970, (n ?? 1) - 1, r ?? 1);
}
function G(e = /* @__PURE__ */ new Date()) {
	let t = (e) => String(e).padStart(2, "0");
	return `${e.getFullYear()}-${t(e.getMonth() + 1)}-${t(e.getDate())}`;
}
function K(e, t) {
	if (!e) return "";
	let n = e.length === 10 ? ot(e) : new Date(e);
	return new Intl.DateTimeFormat(t, { dateStyle: "medium" }).format(n);
}
function st(e, t) {
	return new Intl.DateTimeFormat(t, {
		month: "long",
		year: "numeric"
	}).format(new Date(e));
}
function ct(e) {
	let t = new Date(e);
	return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
}
function lt(e, t, n = 1) {
	return new Intl.NumberFormat(t, { maximumFractionDigits: n }).format(e);
}
function q(e, t) {
	return e == null ? "" : e >= 100 ? `${lt(e / 100, t, 2)} m` : `${lt(e, t)} cm`;
}
function ut(e, t) {
	if (e == null) return "";
	if (e < 1) return t("age.under_month");
	let n = Math.floor(e / 12), r = e % 12, i = [];
	return n && i.push(t(n === 1 ? "age.year_one" : "age.year_other", { n })), r && i.push(t(r === 1 ? "age.month_one" : "age.month_other", { n: r })), i.join(", ");
}
// src/util/chart.ts
var J = {
	top: 12,
	right: 16,
	bottom: 28,
	left: 48
};
function dt(e, t = 4) {
	if (e <= 0) return 1;
	let n = e / t, r = 10 ** Math.floor(Math.log10(n));
	for (let e of [
		1,
		2,
		5,
		10
	]) if (n <= e * r) return e * r;
	return 10 * r;
}
function ft(e, t, n) {
	let r = [...e].sort((e, t) => e.measured_on.localeCompare(t.measured_on)), i = r.flatMap((e) => [e.height_cm ?? 0, e.width_cm ?? 0]), a = dt(Math.max(0, ...i)), o = a * 4, s = Math.max(1, t - J.left - J.right), c = Math.max(1, n - J.top - J.bottom), l = r.map((e) => ot(e.measured_on).getTime()), u = l[0] ?? 0, d = (l[l.length - 1] ?? 0) - u, f = (e) => J.left + (d === 0 ? s / 2 : (e - u) / d * s), p = (e) => J.top + c - e / o * c, m = (e) => r.flatMap((t, n) => {
		let r = t[e];
		return r === null ? [] : [{
			x: f(l[n] ?? u),
			y: p(r),
			value: r,
			date: t.measured_on
		}];
	});
	return {
		height: m("height_cm"),
		width: m("width_cm"),
		ticks: [
			0,
			1,
			2,
			3,
			4
		].map((e) => ({
			y: p(a * e),
			value: a * e
		})),
		first: r[0]?.measured_on ?? null,
		last: r.length > 1 ? r[r.length - 1]?.measured_on ?? null : null
	};
}
function pt(e) {
	return e.map((e, t) => `${t ? "L" : "M"}${e.x.toFixed(1)},${e.y.toFixed(1)}`).join(" ");
}
// src/components/growth-chart.ts
var Y = 200;
H("pg-growth-chart", class extends B {
	static {
		this.properties = {
			measurements: { attribute: !1 },
			_width: { state: !0 }
		};
	}
	constructor() {
		super(), this.measurements = [], this._width = 600;
	}
	connectedCallback() {
		super.connectedCallback(), typeof ResizeObserver < "u" && (this._observer = new ResizeObserver(([e]) => {
			let t = Math.round(e?.contentRect.width ?? 0);
			t > 0 && t !== this._width && (this._width = t);
		}), this._observer.observe(this));
	}
	disconnectedCallback() {
		super.disconnectedCallback(), this._observer?.disconnect();
	}
	_series(e, t, n) {
		return e.length ? O`
      <path class="line ${t}" d=${pt(e)}></path>
      ${e.map((e) => O`<circle class="dot ${t}" cx=${e.x} cy=${e.y} r="4">
          <title>${n} ${K(e.date, this.language)}: ${q(e.value, this.language)}</title>
        </circle>`)}
    ` : A;
	}
	render() {
		let { t: e, language: t } = this, n = ft(this.measurements, this._width, Y), r = this._width - J.right, i = Y - J.bottom + 18;
		return D`
      <svg
        viewBox="0 0 ${this._width} ${Y}"
        width=${this._width}
        height=${Y}
        role="img"
        aria-label=${e("chart.label")}
      >
        ${n.ticks.map((e) => O`
            <line class="grid" x1=${J.left} x2=${r} y1=${e.y} y2=${e.y}></line>
            <text class="tick" x=${J.left - 8} y=${e.y + 4} text-anchor="end">
              ${q(e.value, t)}
            </text>`)}
        ${n.first ? O`<text class="tick" x=${J.left} y=${i}>${K(n.first, t)}</text>` : A}
        ${n.last ? O`<text class="tick" x=${r} y=${i} text-anchor="end">${K(n.last, t)}</text>` : A}
        ${this._series(n.width, "width", e("field.width"))}
        ${this._series(n.height, "height", e("field.height"))}
      </svg>
      <div class="legend">
        <span class="key height">${e("field.height")}</span>
        <span class="key width">${e("field.width")}</span>
      </div>
    `;
	}
	static {
		this.styles = f`
    :host {
      display: block;
      min-width: 0;
    }
    svg {
      display: block;
      max-width: 100%;
      overflow: visible;
    }
    .grid {
      stroke: var(--pg-divider);
      stroke-width: 1;
    }
    .tick {
      fill: var(--pg-text-muted);
      font-size: 11px;
    }
    .line {
      fill: none;
      stroke-width: 2.5;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
    .line.height {
      stroke: var(--pg-leaf);
    }
    .line.width {
      stroke: var(--pg-soil);
      stroke-dasharray: 6 4;
    }
    .dot {
      stroke: var(--pg-surface);
      stroke-width: 2;
    }
    .dot.height {
      fill: var(--pg-leaf);
    }
    .dot.width {
      fill: var(--pg-soil);
    }
    .legend {
      display: flex;
      gap: 16px;
      margin-top: 4px;
      font-size: 12px;
      color: var(--pg-text-muted);
    }
    .key::before {
      content: "";
      display: inline-block;
      width: 14px;
      height: 3px;
      margin-right: 6px;
      vertical-align: middle;
      border-radius: 2px;
    }
    .key.height::before {
      background: var(--pg-leaf);
    }
    .key.width::before {
      background: var(--pg-soil);
    }
  `;
	}
});
// src/util/tags.ts
var mt = [
	"development",
	"problem",
	"flowering",
	"harvest"
];
function ht(e, t) {
	return mt.includes(e) ? t(`tag.${e}`) : e;
}
function gt(e, t) {
	return e.includes(t) ? e.filter((e) => e !== t) : [...e, t];
}
H("pg-photo-viewer", class extends B {
	static {
		this.properties = {
			photos: { attribute: !1 },
			plantId: { attribute: !1 },
			coverId: { attribute: !1 },
			_index: { state: !0 },
			_tags: { state: !0 },
			_note: { state: !0 },
			_newTag: { state: !0 },
			_busy: { state: !0 },
			_error: { state: !0 }
		};
	}
	constructor() {
		super(), this.photos = [], this.coverId = null, this._index = 0, this._tags = [], this._note = "", this._newTag = "", this._busy = !1, this._error = "";
	}
	open(e) {
		this._show(e), this.updateComplete.then(() => this._dialog?.showModal());
	}
	close() {
		this._dialog?.close();
	}
	get _dialog() {
		return this.renderRoot.querySelector("dialog");
	}
	get _photo() {
		return this.photos[this._index];
	}
	_show(e) {
		let t = this.photos.length;
		this._index = t ? (e + t) % t : 0, this._tags = [...this._photo?.tags ?? []], this._note = this._photo?.note ?? "", this._newTag = "", this._error = "";
	}
	willUpdate(e) {
		if (e.has("photos") && this._dialog?.open) {
			if (!this.photos.length) {
				this.close();
				return;
			}
			let t = e.get("photos")?.[this._index]?.id, n = this.photos.findIndex((e) => e.id === t);
			n >= 0 ? this._index = n : this._show(Math.min(this._index, this.photos.length - 1));
		}
	}
	get _dirty() {
		let e = this._photo;
		return e ? e.note !== this._note || JSON.stringify(e.tags) !== JSON.stringify(this._tags) : !1;
	}
	async _run(e) {
		this._busy = !0, this._error = "";
		try {
			await e(), this.fire("photos-changed");
		} catch (e) {
			this._error = z(e);
		} finally {
			this._busy = !1;
		}
	}
	_save() {
		let e = this._photo;
		return e ? this._run(() => qe(this.hass, e.id, {
			tags: this._tags,
			note: this._note
		})) : Promise.resolve();
	}
	_setCover() {
		let e = this._photo;
		return e ? this._run(async () => {
			await Ue(this.hass, this.plantId, e.id), this.coverId = e.id;
		}) : Promise.resolve();
	}
	async _delete() {
		let e = this._photo, t = this.renderRoot.querySelector("pg-confirm-dialog");
		e && t && await t.ask(this.t("viewer.delete_confirm"), K(e.taken_at, this.language), this.t("common.delete")) && await this._run(() => Je(this.hass, e.id));
	}
	_addTag(e) {
		e.preventDefault();
		let t = this._newTag.trim();
		t && !this._tags.includes(t) && (this._tags = [...this._tags, t]), this._newTag = "";
	}
	_onKey(e) {
		let t = e.target;
		["INPUT", "TEXTAREA"].includes(t.tagName) || (e.key === "ArrowLeft" && this._show(this._index - 1), e.key === "ArrowRight" && this._show(this._index + 1));
	}
	render() {
		let { t: n } = this, i = this._photo, o = this.photos.length > 1, s = i?.id === this.coverId, c = this._tags.filter((e) => !mt.includes(e));
		return D`
      <dialog @keydown=${this._onKey} aria-label=${n("detail.photos")}>
        ${i ? D`
                <div class="layout">
                  <div class="stage">
                    <img
                      src=${i.urls.medium}
                      srcset="${i.urls.medium} 1024w, ${i.urls.original} 2560w"
                      sizes="(max-width: 900px) 100vw, 70vw"
                      alt=${n("viewer.taken", { date: K(i.taken_at, this.language) })}
                    />
                    ${o ? D`
                            <button
                              class="icon-button nav prev"
                              @click=${() => this._show(this._index - 1)}
                              aria-label=${n("viewer.previous")}
                            >
                              ${V("M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z")}
                            </button>
                            <button
                              class="icon-button nav next"
                              @click=${() => this._show(this._index + 1)}
                              aria-label=${n("viewer.next")}
                            >
                              ${V("M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z")}
                            </button>
                            <span class="counter">${this._index + 1} / ${this.photos.length}</span>
                          ` : A}
                  </div>
                  <aside>
                    <div class="aside-header">
                      <h2>
                        ${n("viewer.taken", { date: K(i.taken_at, this.language) })}
                      </h2>
                      <button
                        class="icon-button"
                        @click=${this.close}
                        aria-label=${n("common.close")}
                      >
                        ${V(e)}
                      </button>
                    </div>
                    <div class="field">
                      <span>${n("viewer.tags")}</span>
                      <div class="chips">
                        ${mt.map((e) => D`<button
                              class="chip"
                              aria-pressed=${this._tags.includes(e)}
                              @click=${() => this._tags = gt(this._tags, e)}
                            >
                              ${ht(e, n)}
                            </button>`)}
                        ${c.map((t) => D`<button
                              class="chip selected"
                              @click=${() => this._tags = gt(this._tags, t)}
                              aria-label="${t} ✕"
                            >
                              ${t} ${V(e)}
                            </button>`)}
                      </div>
                      <form class="add-tag" @submit=${this._addTag}>
                        <input
                          maxlength="40"
                          placeholder=${n("viewer.add_tag")}
                          .value=${this._newTag}
                          @input=${(e) => this._newTag = e.target.value}
                        />
                        <button class="icon-button" type="submit" aria-label=${n("viewer.add_tag")}>
                          ${V(r)}
                        </button>
                      </form>
                    </div>
                    <label class="field">
                      <span>${n("viewer.note")}</span>
                      <textarea
                        maxlength="2000"
                        .value=${this._note}
                        @input=${(e) => this._note = e.target.value}
                      ></textarea>
                    </label>
                    ${this._dirty ? D`<button class="button" ?disabled=${this._busy} @click=${this._save}>
                            ${n("common.save")}
                          </button>` : A}
                    ${this._error ? D`<p class="error-text" role="alert">${this._error}</p>` : A}
                    <div class="actions">
                      <button
                        class="button secondary"
                        ?disabled=${this._busy || s}
                        @click=${this._setCover}
                      >
                        ${V(s ? a : "M12,15.39L8.24,17.66L9.23,13.38L5.91,10.5L10.29,10.13L12,6.09L13.71,10.13L18.09,10.5L14.77,13.38L15.76,17.66M22,9.24L14.81,8.63L12,2L9.19,8.63L2,9.24L7.45,13.97L5.82,21L12,17.27L18.18,21L16.54,13.97L22,9.24Z")}
                        ${n(s ? "viewer.is_cover" : "viewer.set_cover")}
                      </button>
                      <a
                        class="button text"
                        href=${i.urls.original}
                        target="_blank"
                        rel="noopener"
                      >
                        ${V("M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z")} ${n("viewer.open_original")}
                      </a>
                      <button
                        class="button text danger"
                        ?disabled=${this._busy}
                        @click=${this._delete}
                      >
                        ${V(t)} ${n("viewer.delete")}
                      </button>
                    </div>
                  </aside>
                </div>
              ` : A}
      </dialog>
      <pg-confirm-dialog .hass=${this.hass}></pg-confirm-dialog>
    `;
	}
	static {
		this.styles = [U, f`
      dialog {
        width: min(1200px, calc(100vw - 24px));
        height: min(820px, calc(100vh - 24px));
        overflow: hidden;
      }
      .layout {
        display: grid;
        grid-template-columns: 1fr 320px;
        height: 100%;
      }
      .stage {
        position: relative;
        display: grid;
        place-items: center;
        min-height: 0;
        background: #111;
      }
      .stage img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
      .nav {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        background: rgba(0, 0, 0, 0.45);
        color: #fff;
      }
      .nav:hover {
        background: rgba(0, 0, 0, 0.65);
      }
      .prev {
        left: 12px;
      }
      .next {
        right: 12px;
      }
      .counter {
        position: absolute;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        padding: 2px 10px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.5);
        color: #fff;
        font-size: 12px;
      }
      aside {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 12px 16px 16px;
        overflow: auto;
      }
      .aside-header {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .aside-header h2 {
        flex: 1;
        margin: 0;
        font-size: 16px;
        font-weight: 500;
      }
      .add-tag {
        display: flex;
        gap: 4px;
        margin-top: 6px;
      }
      .actions {
        display: grid;
        gap: 4px;
        justify-items: start;
        margin-top: auto;
      }
      a.button {
        text-decoration: none;
      }
      @media (max-width: 800px) {
        dialog {
          width: 100vw;
          max-width: 100vw;
          height: 100vh;
          max-height: 100vh;
          border-radius: 0;
        }
        .layout {
          grid-template-columns: 1fr;
          grid-template-rows: minmax(0, 55vh) auto;
          overflow: auto;
        }
        aside {
          overflow: visible;
        }
      }
    `];
	}
});
// src/api/types.ts
var _t = [
	"perennial",
	"shrub",
	"tree",
	"hedge",
	"climber",
	"grass",
	"lawn",
	"bulb",
	"annual",
	"vegetable",
	"herb",
	"fruit",
	"succulent",
	"potted",
	"other"
], vt = [
	"bed",
	"raised_bed",
	"pot",
	"lawn",
	"greenhouse",
	"covered"
], yt = [
	"full_sun",
	"partial_shade",
	"shade"
], bt = [
	"very_low",
	"low",
	"moderate",
	"high"
], xt = [
	"sand",
	"loamy_sand",
	"sandy_loam",
	"loam",
	"silt_loam",
	"clay_loam",
	"clay",
	"potting_mix"
], St = [
	"healthy",
	"watch",
	"problem",
	"dead",
	"removed"
], X = (e) => e == null ? "" : String(e);
function Ct(e = G()) {
	return {
		name: "",
		scientific_name: "",
		variety: "",
		family: "",
		notes: "",
		category: "other",
		location_type: "bed",
		light: "",
		water_need: "",
		soil_type: "",
		status: "healthy",
		min_temperature_c: "",
		root_depth_cm: "",
		planted_on: "",
		age_years: "",
		age_months: "",
		age_on: e,
		tags: ""
	};
}
function wt(e, t = G()) {
	return {
		name: e.name,
		scientific_name: X(e.scientific_name),
		variety: X(e.variety),
		family: X(e.family),
		notes: X(e.notes),
		category: e.category,
		location_type: e.location_type,
		light: X(e.light),
		water_need: X(e.water_need),
		soil_type: X(e.soil_type),
		status: e.status,
		min_temperature_c: X(e.min_temperature_c),
		root_depth_cm: X(e.root_depth_cm),
		planted_on: X(e.planted_on),
		age_years: e.age ? X(Math.floor(e.age.age_months / 12)) : "",
		age_months: e.age ? X(e.age.age_months % 12) : "",
		age_on: e.age?.on ?? t,
		tags: e.tags.join(", ")
	};
}
var Z = (e) => e.trim() || null;
function Q(e) {
	let t = e.trim().replace(",", ".");
	if (!t) return null;
	let n = Number(t);
	return Number.isFinite(n) ? n : null;
}
function Tt(e) {
	let t = Q(e);
	return t === null ? 0 : Math.max(0, Math.round(t));
}
function Et(e) {
	let t = e.age_years.trim() !== "" || e.age_months.trim() !== "";
	return {
		name: e.name.trim(),
		scientific_name: Z(e.scientific_name),
		variety: Z(e.variety),
		family: Z(e.family),
		notes: Z(e.notes),
		category: e.category,
		location_type: e.location_type,
		light: Z(e.light) ?? null,
		water_need: Z(e.water_need) ?? null,
		soil_type: Z(e.soil_type) ?? null,
		status: e.status,
		min_temperature_c: Q(e.min_temperature_c),
		root_depth_cm: Q(e.root_depth_cm),
		planted_on: Z(e.planted_on),
		age: t ? {
			age_months: Tt(e.age_years) * 12 + Tt(e.age_months),
			on: e.age_on || G()
		} : null,
		tags: e.tags.split(",").map((e) => e.trim()).filter(Boolean)
	};
}
function Dt(e, t) {
	return JSON.stringify(e) === JSON.stringify(t);
}
function Ot(e, t) {
	let n = {};
	for (let r of Object.keys(e)) {
		let i = e[r];
		t ? Dt(i, t[r]) || Object.assign(n, { [r]: i }) : i !== null && !(Array.isArray(i) && i.length === 0) && Object.assign(n, { [r]: i });
	}
	return n;
}
function kt(e) {
	let { name: t, scientific_name: n, variety: r, family: i, notes: a, category: o, location_type: s, light: c, water_need: l, soil_type: u, status: d, min_temperature_c: f, root_depth_cm: p, planted_on: m, age: ee, tags: te } = e;
	return {
		name: t,
		scientific_name: n,
		variety: r,
		family: i,
		notes: a,
		category: o,
		location_type: s,
		light: c,
		water_need: l,
		soil_type: u,
		status: d,
		min_temperature_c: f,
		root_depth_cm: p,
		planted_on: m,
		age: ee,
		tags: te
	};
}
// src/util/exif.ts
var At = 34665, jt = 306, Mt = 36867, Nt = 36881, Pt = 2;
function Ft(e, t) {
	let { view: n, start: r, little: i } = e;
	if (n.getUint16(t + 2, i) !== Pt) return null;
	let a = n.getUint32(t + 4, i), o = a <= 4 ? t + 8 : r + n.getUint32(t + 8, i);
	if (o + a > n.byteLength) return null;
	let s = "";
	for (let e = 0; e < a; e++) {
		let t = n.getUint8(o + e);
		if (t === 0) break;
		s += String.fromCharCode(t);
	}
	return s;
}
function It(e, t) {
	let { view: n, start: r, little: i } = e, a = /* @__PURE__ */ new Map(), o = r + t;
	if (o + 2 > n.byteLength) return a;
	let s = n.getUint16(o, i);
	for (let e = 0; e < s; e++) {
		let t = o + 2 + e * 12;
		if (t + 12 > n.byteLength) break;
		a.set(n.getUint16(t, i), t);
	}
	return a;
}
function Lt(e, t) {
	let n = e.getUint16(t);
	if (n !== 18761 && n !== 19789) return null;
	let r = {
		view: e,
		start: t,
		little: n === 18761
	};
	if (e.getUint16(t + 2, r.little) !== 42) return null;
	let i = It(r, e.getUint32(t + 4, r.little)), a = null, o = null, s = i.get(At);
	if (s !== void 0) {
		let t = It(r, e.getUint32(s + 8, r.little)), n = t.get(Mt);
		n !== void 0 && (a = Ft(r, n));
		let i = t.get(Nt);
		i !== void 0 && (o = Ft(r, i));
	}
	if (!a) {
		let e = i.get(jt);
		e !== void 0 && (a = Ft(r, e));
	}
	let c = a?.trim().match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
	if (!c) return null;
	let [, l, u, d, f, p, m] = c;
	return `${l}-${u}-${d}T${f}:${p}:${m}${o && /^[+-]\d{2}:\d{2}$/.test(o) ? o : ""}`;
}
function Rt(e) {
	let t = new DataView(e);
	if (t.byteLength < 4 || t.getUint16(0) !== 65496) return null;
	let n = 2;
	try {
		for (; n + 4 <= t.byteLength;) {
			let e = t.getUint16(n);
			if ((e & 65280) != 65280 || e === 65498 || e === 65497) return null;
			let r = t.getUint16(n + 2);
			if (e === 65505 && n + 10 <= t.byteLength && t.getUint32(n + 4) === 1165519206 && t.getUint16(n + 8) === 0) return Lt(t, n + 10);
			n += 2 + r;
		}
	} catch {
		return null;
	}
	return null;
}
// src/util/image.ts
var zt = 2560, Bt = 4194304;
function Vt(e, t, n = zt) {
	let r = Math.min(1, n / Math.max(e, t));
	return {
		width: Math.round(e * r),
		height: Math.round(t * r)
	};
}
function Ht(e) {
	return `${e.replace(/\.[^.]+$/, "") || "photo"}.jpg`;
}
async function Ut(e, t, n) {
	if (typeof OffscreenCanvas < "u") {
		let r = new OffscreenCanvas(t, n);
		return r.getContext("2d")?.drawImage(e, 0, 0, t, n), r.convertToBlob({
			type: "image/jpeg",
			quality: .9
		});
	}
	let r = document.createElement("canvas");
	return r.width = t, r.height = n, r.getContext("2d")?.drawImage(e, 0, 0, t, n), new Promise((e, t) => r.toBlob((n) => n ? e(n) : t(/* @__PURE__ */ Error("encoding failed")), "image/jpeg", .9));
}
async function Wt(e) {
	let t = (e.type === "image/jpeg" ? Rt(await e.arrayBuffer()) : null) ?? (e.lastModified ? new Date(e.lastModified).toISOString() : null), n;
	try {
		n = await createImageBitmap(e, { imageOrientation: "from-image" });
	} catch {
		return {
			blob: e,
			filename: e.name,
			takenAt: t
		};
	}
	try {
		let r = Vt(n.width, n.height);
		return e.type === "image/jpeg" && e.size <= Bt && r.width === n.width ? {
			blob: e,
			filename: e.name,
			takenAt: t
		} : {
			blob: await Ut(n, r.width, r.height),
			filename: Ht(e.name),
			takenAt: t
		};
	} finally {
		n.close();
	}
}
// src/util/upload.ts
var Gt = /* @__PURE__ */ new Set([
	"invalid_image",
	"unsupported_format",
	"image_too_large"
]);
function Kt(e, t) {
	if (e instanceof Ge) {
		if (e.status === 413) return t("upload.too_large");
		if (e.code && Gt.has(e.code)) return t(`upload.${e.code}`);
	}
	return t("upload.failed");
}
async function qt(e, t, n, r, i) {
	let a = {
		photos: [],
		errors: []
	};
	for (let [o, s] of n.entries()) {
		i?.(o + 1, n.length);
		try {
			let n = await Wt(s);
			a.photos.push(await Ke(e, {
				plantId: t,
				file: n.blob,
				filename: n.filename,
				takenAt: n.takenAt
			}));
		} catch (e) {
			a.errors.push(`${s.name}: ${Kt(e, r)}`);
		}
	}
	return a;
}
H("pg-plant-form", class extends B {
	static {
		this.properties = {
			_plant: { state: !0 },
			_state: { state: !0 },
			_files: { state: !0 },
			_height: { state: !0 },
			_width: { state: !0 },
			_busy: { state: !0 },
			_progress: { state: !0 },
			_errors: { state: !0 }
		};
	}
	constructor() {
		super(), this._reset();
	}
	_reset(e) {
		this._plant = e, this._state = e ? wt(e) : Ct(), this._files = [], this._height = "", this._width = "", this._busy = !1, this._progress = "", this._errors = [], this._created = void 0;
	}
	open(e) {
		this._reset(e), this.updateComplete.then(() => {
			this._dialog?.showModal(), this.renderRoot.querySelector("#name")?.focus();
		});
	}
	close() {
		this._dialog?.close();
	}
	get _dialog() {
		return this.renderRoot.querySelector("dialog");
	}
	_set(e, t) {
		this._state = {
			...this._state,
			[e]: t
		};
	}
	_input(e) {
		return (t) => this._set(e, t.target.value);
	}
	async _submit(e) {
		if (e.preventDefault(), this._busy) return;
		if (this._created) {
			this._finish(this._created, !0);
			return;
		}
		let t = Et(this._state);
		if (!t.name) this._errors = [this.t("form.name_required")];
		else {
			this._busy = !0, this._errors = [];
			try {
				if (this._plant) {
					let e = Ot(t, kt(this._plant)), n = Object.keys(e).length ? await Ve(this.hass, this._plant.id, e) : this._plant;
					this._finish(n, !1);
				} else await this._create(t);
			} catch (e) {
				this._errors = [z(e)];
			} finally {
				this._busy = !1, this._progress = "";
			}
		}
	}
	async _create(e) {
		let t = await Be(this.hass, {
			...Ot(e, null),
			name: e.name
		}), n = Q(this._height), r = Q(this._width), i = [];
		if (n !== null || r !== null) try {
			await Ye(this.hass, t.id, {
				measured_on: G(),
				height_cm: n,
				width_cm: r
			});
		} catch (e) {
			i.push(z(e));
		}
		if (this._files.length) {
			let e = await qt(this.hass, t.id, this._files, this.t, (e, t) => {
				this._progress = this.t("detail.uploading", {
					current: e,
					total: t
				});
			});
			i.push(...e.errors);
		}
		i.length ? (this._created = t, this._errors = i) : this._finish(t, !0);
	}
	_finish(e, t) {
		this.close(), this.fire("plant-saved", {
			plant: e,
			created: t
		});
	}
	_select(e, t, n, r) {
		let i = this._state[e];
		return D`<select id=${e} .value=${i} @change=${this._input(e)}>
      ${r ? D`<option value="" ?selected=${i === ""}>${this.t("common.not_set")}</option>` : A}
      ${t.map((e) => D`<option value=${e} ?selected=${i === e}>
            ${this.t(`${n}.${e}`)}
          </option>`)}
    </select>`;
	}
	_text(e, t, n = "text") {
		return D`<label class="field">
      <span>${this.t(t)}</span>
      <input id=${e} type=${n} .value=${this._state[e]} @input=${this._input(e)} />
    </label>`;
	}
	render() {
		let { t } = this, n = !!this._plant, r = n ? t("form.edit_title", { name: this._plant?.name ?? "" }) : t("form.create_title");
		return D`
      <dialog aria-labelledby="form-title" @close=${() => this._busy = !1}>
        <form @submit=${this._submit} novalidate>
          <div class="dialog-header">
            <h2 id="form-title">${r}</h2>
            <button
              type="button"
              class="icon-button"
              @click=${this.close}
              aria-label=${t("common.close")}
            >
              ${V(e)}
            </button>
          </div>
          <div class="dialog-body">
            <fieldset ?disabled=${this._busy || !!this._created}>
              <legend>${t("form.section_basics")}</legend>
              <div class="grid">
                <label class="field wide">
                  <span>${t("field.name")} *</span>
                  <input
                    id="name"
                    required
                    maxlength="100"
                    autocomplete="off"
                    .value=${this._state.name}
                    @input=${this._input("name")}
                  />
                </label>
                <label class="field">
                  <span>${t("field.scientific_name")}</span>
                  <input
                    class="latin"
                    .value=${this._state.scientific_name}
                    @input=${this._input("scientific_name")}
                  />
                </label>
                <label class="field">
                  <span>${t("field.variety")}</span>
                  <input .value=${this._state.variety} @input=${this._input("variety")} />
                </label>
              </div>
            </fieldset>

            <fieldset ?disabled=${this._busy || !!this._created}>
              <legend>${t("form.section_classification")}</legend>
              <div class="grid">
                <label class="field"
                  ><span>${t("field.category")}</span>
                  ${this._select("category", _t, "category", !1)}</label
                >
                <label class="field"
                  ><span>${t("field.location_type")}</span>
                  ${this._select("location_type", vt, "location", !1)}</label
                >
                <label class="field"
                  ><span>${t("field.light")}</span>
                  ${this._select("light", yt, "light", !0)}</label
                >
                <label class="field"
                  ><span>${t("field.water_need")}</span>
                  ${this._select("water_need", bt, "water", !0)}</label
                >
                <label class="field"
                  ><span>${t("field.soil_type")}</span>
                  ${this._select("soil_type", xt, "soil", !0)}</label
                >
                ${n ? D`<label class="field"
                        ><span>${t("field.status")}</span>
                        ${this._select("status", St, "status", !1)}</label
                      >` : A}
              </div>
            </fieldset>

            <fieldset ?disabled=${this._busy || !!this._created}>
              <legend>${t("form.section_age")}</legend>
              <div class="grid">
                ${this._text("planted_on", "field.planted_on", "date")}
                <div class="age wide">
                  <label class="field">
                    <span>${t("form.age_years")}</span>
                    <input
                      type="number"
                      min="0"
                      inputmode="numeric"
                      .value=${this._state.age_years}
                      @input=${this._input("age_years")}
                    />
                  </label>
                  <label class="field">
                    <span>${t("form.age_months")}</span>
                    <input
                      type="number"
                      min="0"
                      max="11"
                      inputmode="numeric"
                      .value=${this._state.age_months}
                      @input=${this._input("age_months")}
                    />
                  </label>
                  <label class="field">
                    <span>${t("form.age_on")}</span>
                    <input
                      type="date"
                      .value=${this._state.age_on}
                      @input=${this._input("age_on")}
                    />
                  </label>
                  <small class="hint">${t("form.age_hint")}</small>
                </div>
              </div>
            </fieldset>

            ${n ? A : this._renderStart()}

            <fieldset ?disabled=${this._busy || !!this._created}>
              <legend>${t("form.section_more")}</legend>
              <div class="grid">
                ${this._text("min_temperature_c", "field.min_temperature_c", "number")}
                ${this._text("root_depth_cm", "field.root_depth_cm", "number")}
                <label class="field wide">
                  <span>${t("field.tags")}</span>
                  <input .value=${this._state.tags} @input=${this._input("tags")} />
                  <small>${t("form.tags_hint")}</small>
                </label>
                <label class="field wide">
                  <span>${t("field.notes")}</span>
                  <textarea .value=${this._state.notes} @input=${this._input("notes")}></textarea>
                </label>
              </div>
            </fieldset>
          </div>
          <div class="dialog-actions">
            ${this._progress ? D`<span class="progress muted">${this._progress}</span>` : A}
            ${this._errors.length ? D`<ul class="errors error-text" role="alert">
                    ${this._errors.map((e) => D`<li>${e}</li>`)}
                  </ul>` : A}
            ${this._created ? A : D`<button type="button" class="button text" @click=${this.close}>
                    ${t("common.cancel")}
                  </button>`}
            <button type="submit" class="button" ?disabled=${this._busy}>
              ${this._created ? t("form.continue", { name: this._created.name }) : t(n ? "common.save" : "form.create")}
            </button>
          </div>
        </form>
      </dialog>
    `;
	}
	_renderStart() {
		let { t: e } = this;
		return D`<fieldset ?disabled=${this._busy || !!this._created}>
      <legend>${e("form.section_start")}</legend>
      <div class="grid">
        <label class="field wide files">
          <span>${e("form.photos")}</span>
          <span class="file-button button secondary">
            ${V(n)} ${e("detail.add_photos")}
            ${this._files.length ? D`<b>· ${e("form.photos_selected", { n: this._files.length })}</b>` : A}
          </span>
          <input
            class="sr-only"
            type="file"
            accept="image/*"
            multiple
            @change=${(e) => {
			this._files = [...e.target.files ?? []];
		}}
          />
          <small>${e("form.photos_hint")}</small>
        </label>
        <label class="field">
          <span>${e("form.height_cm")}</span>
          <input
            type="number"
            min="0"
            inputmode="decimal"
            .value=${this._height}
            @input=${(e) => this._height = e.target.value}
          />
        </label>
        <label class="field">
          <span>${e("form.width_cm")}</span>
          <input
            type="number"
            min="0"
            inputmode="decimal"
            .value=${this._width}
            @input=${(e) => this._width = e.target.value}
          />
        </label>
      </div>
    </fieldset>`;
	}
	static {
		this.styles = [U, f`
      dialog {
        width: min(720px, calc(100vw - 24px));
      }
      fieldset {
        margin: 0 0 16px;
        padding: 0;
        border: none;
        min-width: 0;
      }
      legend {
        padding: 0;
        margin-bottom: 8px;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        color: var(--pg-text-muted);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 12px;
      }
      .wide {
        grid-column: 1 / -1;
      }
      .age {
        display: grid;
        grid-template-columns: 1fr 1fr 1.4fr;
        gap: 12px;
      }
      .age .hint {
        grid-column: 1 / -1;
        font-size: 12px;
        color: var(--pg-text-muted);
      }
      .latin {
        font-style: italic;
      }
      .files {
        cursor: pointer;
      }
      .file-button {
        justify-self: start;
      }
      .files:focus-within .file-button {
        outline: 2px solid var(--pg-accent);
        outline-offset: 2px;
      }
      .dialog-actions {
        flex-wrap: wrap;
        align-items: center;
      }
      .progress {
        margin-right: auto;
      }
      .errors {
        flex-basis: 100%;
        margin: 0;
        padding-left: 18px;
      }
      @media (max-width: 520px) {
        .age {
          grid-template-columns: 1fr 1fr;
        }
      }
    `];
	}
});
// src/views/plant-detail.ts
function Jt(e) {
	let t = [];
	for (let n of e) {
		let e = ct(n.taken_at), r = t[t.length - 1];
		r?.key === e ? r.photos.push(n) : t.push({
			key: e,
			photos: [n]
		});
	}
	return t;
}
H("pg-plant-detail", class extends B {
	static {
		this.properties = {
			store: { attribute: !1 },
			plantId: { attribute: !1 },
			prefix: {},
			_detail: { state: !0 },
			_error: { state: !0 },
			_notFound: { state: !0 },
			_uploading: { state: !0 },
			_uploadErrors: { state: !0 },
			_dragging: { state: !0 },
			_mDate: { state: !0 },
			_mHeight: { state: !0 },
			_mWidth: { state: !0 },
			_mError: { state: !0 }
		};
	}
	constructor() {
		super(), this._loadedAt = 0, this._onPlantChanged = (e) => {
			let t = e.detail;
			t.plant_id === this.plantId && (t.kind === "plant_removed" ? this._notFound = !0 : (clearTimeout(this._reloadTimer), this._reloadTimer = setTimeout(() => void this._load(), 150)));
		}, this._onStoreChange = () => {
			Date.now() - this._loadedAt > 36e5 && this._load();
		}, this.prefix = "/plant-garden", this._error = "", this._notFound = !1, this._uploading = "", this._uploadErrors = [], this._dragging = !1, this._mDate = G(), this._mHeight = "", this._mWidth = "", this._mError = "";
	}
	connectedCallback() {
		super.connectedCallback(), this.store?.addEventListener("plant-changed", this._onPlantChanged), this.store?.addEventListener("change", this._onStoreChange);
	}
	disconnectedCallback() {
		super.disconnectedCallback(), clearTimeout(this._reloadTimer), this.store?.removeEventListener("plant-changed", this._onPlantChanged), this.store?.removeEventListener("change", this._onStoreChange);
	}
	willUpdate(e) {
		e.has("plantId") && this.plantId && (this._detail = void 0, this._notFound = !1, this._error = "", this._load());
	}
	async _load() {
		let e = this.plantId;
		try {
			let t = await ze(this.hass, e);
			if (e !== this.plantId) return;
			this._detail = t, this._error = "", this._loadedAt = Date.now();
		} catch (e) {
			e.code === "not_found" ? this._notFound = !0 : this._error = z(e);
		}
	}
	_edit() {
		let e = this._detail?.plant;
		e && this.renderRoot.querySelector("pg-plant-form")?.open(e);
	}
	async _delete() {
		let e = this._detail?.plant, t = this.renderRoot.querySelector("pg-confirm-dialog");
		if (e && t && await t.ask(this.t("detail.delete_title", { name: e.name }), this.t("detail.delete_body"), this.t("common.delete"))) try {
			await He(this.hass, e.id), this.store.refresh(), W(this.prefix, { replace: !0 });
		} catch (e) {
			this._error = z(e);
		}
	}
	_pickFiles() {
		this.renderRoot.querySelector("#file-input")?.click();
	}
	async _upload(e) {
		let t = e.filter((e) => e.type.startsWith("image/") || e.type === "");
		if (!t.length || this._uploading) return;
		this._uploadErrors = [];
		let n = await qt(this.hass, this.plantId, t, this.t, (e, t) => {
			this._uploading = this.t("detail.uploading", {
				current: e,
				total: t
			});
		});
		this._uploading = "", this._uploadErrors = n.errors, await this._load();
	}
	_onFileInput(e) {
		let t = e.target;
		this._upload([...t.files ?? []]), t.value = "";
	}
	_onDrop(e) {
		e.preventDefault(), this._dragging = !1, this._upload([...e.dataTransfer?.files ?? []]);
	}
	_onDragOver(e) {
		e.dataTransfer?.types.includes("Files") && (e.preventDefault(), this._dragging = !0);
	}
	_openPhoto(e) {
		let t = this._detail?.photos.findIndex((t) => t.id === e.id) ?? -1;
		t >= 0 && this.renderRoot.querySelector("pg-photo-viewer")?.open(t);
	}
	async _addMeasurement(e) {
		e.preventDefault();
		let t = Q(this._mHeight), n = Q(this._mWidth);
		if (t === null && n === null) this._mError = this.t("detail.measurement_needs_value");
		else try {
			await Ye(this.hass, this.plantId, {
				measured_on: this._mDate || G(),
				height_cm: t,
				width_cm: n
			}), this._mHeight = "", this._mWidth = "", this._mError = "", await this._load();
		} catch (e) {
			this._mError = z(e);
		}
	}
	async _deleteMeasurement(e) {
		try {
			await Xe(this.hass, e), await this._load();
		} catch (e) {
			this._mError = z(e);
		}
	}
	_facts(e) {
		let { t, language: n } = this, r = (t) => e.sources[t];
		return [
			{
				label: "field.category",
				value: t(`category.${e.category}`),
				source: r("category")
			},
			{
				label: "field.location_type",
				value: t(`location.${e.location_type}`),
				source: r("location_type")
			},
			e.light ? {
				label: "field.light",
				value: t(`light.${e.light}`),
				source: r("light")
			} : null,
			e.water_need ? {
				label: "field.water_need",
				value: t(`water.${e.water_need}`),
				source: r("water_need")
			} : null,
			e.soil_type ? {
				label: "field.soil_type",
				value: t(`soil.${e.soil_type}`),
				source: r("soil_type")
			} : null,
			e.age_months_now === null ? null : {
				label: "field.age",
				value: ut(e.age_months_now, t),
				source: r("age") ?? r("planted_on")
			},
			e.planted_on ? {
				label: "field.planted_on",
				value: K(e.planted_on, n),
				source: r("planted_on")
			} : null,
			e.height_cm === null ? null : {
				label: "field.height",
				value: q(e.height_cm, n)
			},
			e.width_cm === null ? null : {
				label: "field.width",
				value: q(e.width_cm, n)
			},
			e.min_temperature_c === null ? null : {
				label: "field.min_temperature_c",
				value: t("detail.frost_to", { temp: lt(e.min_temperature_c, n) }),
				source: r("min_temperature_c")
			},
			e.root_depth_cm === null ? null : {
				label: "field.root_depth_cm",
				value: q(e.root_depth_cm, n),
				source: r("root_depth_cm")
			}
		].filter((e) => e !== null);
	}
	_sourceMark(e) {
		if (!e) return A;
		let { t } = this, n = e.source === "ai" ? e.confidence === null ? t("source.ai") : t("source.ai_confidence", { confidence: Math.round(e.confidence * 100) }) : t(`source.${e.source}`), r = e.source === "user" ? "M2 17V20H10V18.11H3.9V17C3.9 16.36 7.03 14.9 10 14.9C10.96 14.91 11.91 15.04 12.83 15.28L14.35 13.76C12.95 13.29 11.5 13.03 10 13C7.33 13 2 14.33 2 17M10 4C7.79 4 6 5.79 6 8S7.79 12 10 12 14 10.21 14 8 12.21 4 10 4M10 10C8.9 10 8 9.11 8 8S8.9 6 10 6 12 6.9 12 8 11.11 10 10 10M21.7 13.35L20.7 14.35L18.65 12.35L19.65 11.35C19.86 11.14 20.21 11.14 20.42 11.35L21.7 12.63C21.91 12.84 21.91 13.19 21.7 13.4M12 18.94L18.06 12.88L20.11 14.88L14.11 20.95H12V18.94" : "M9 4L11.5 9.5L17 12L11.5 14.5L9 20L6.5 14.5L1 12L6.5 9.5L9 4M9 8.83L8 11L5.83 12L8 13L9 15.17L10 13L12.17 12L10 11L9 8.83M19 9L17.74 6.26L15 5L17.74 3.75L19 1L20.25 3.75L23 5L20.25 6.26L19 9M19 23L17.74 20.26L15 19L17.74 17.75L19 15L20.25 17.75L23 19L20.25 20.26L19 23Z";
		return D`<span class="source source-${e.source}" title=${n}
      >${V(r, n)}</span
    >`;
	}
	render() {
		let { t: e } = this;
		if (this._notFound) return D`<section class="card message">
        <p>${e("detail.not_found")}</p>
        <button class="button" @click=${() => W(this.prefix, { replace: !0 })}>
          ${e("detail.back_to_list")}
        </button>
      </section>`;
		if (!this._detail) return this._error ? D`<p class="error-text" role="alert">${this._error}</p>` : D`<p class="muted loading">${e("panel.loading")}</p>`;
		let { plant: r, photos: a, measurements: o } = this._detail, s = r.cover, c = [r.scientific_name, r.variety && `'${r.variety}'`].filter(Boolean).join(" ");
		return D`
      ${this._error ? D`<p class="error-text" role="alert">${this._error}</p>` : A}
      <section class="card hero">
        <button
          class="cover"
          ?disabled=${!s}
          @click=${() => {
			let e = a.find((e) => e.id === s?.id);
			e && this._openPhoto(e);
		}}
          aria-label=${e("detail.cover")}
        >
          ${s ? D`<img src=${s.urls.medium} alt="" />` : D`<span class="placeholder">${V(i)}</span>`}
        </button>
        <div class="summary">
          <div class="title-row">
            <h2>${r.name}</h2>
            <span class="status status-${r.status}">${e(`status.${r.status}`)}</span>
          </div>
          ${c ? D`<p class="latin">${c}</p>` : A}
          ${r.family ? D`<p class="muted family">${r.family}</p>` : A}
          ${r.tags.length ? D`<div class="chips">
                  ${r.tags.map((e) => D`<span class="chip static">${e}</span>`)}
                </div>` : A}
          <dl class="facts">
            ${this._facts(r).map((t) => D`<div>
                  <dt>${e(t.label)}</dt>
                  <dd>${t.value} ${this._sourceMark(t.source)}</dd>
                </div>`)}
          </dl>
          <div class="actions">
            <button class="button" @click=${this._pickFiles} ?disabled=${!!this._uploading}>
              ${V(n)} ${e("detail.add_photos")}
            </button>
            <button class="button secondary" @click=${this._edit}>
              ${V("M14.06,9L15,9.94L5.92,19H5V18.08L14.06,9M17.66,3C17.41,3 17.15,3.1 16.96,3.29L15.13,5.12L18.88,8.87L20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18.17,3.09 17.92,3 17.66,3M14.06,6.19L3,17.25V21H6.75L17.81,9.94L14.06,6.19Z")} ${e("detail.edit")}
            </button>
            <button class="button text danger" @click=${this._delete}>
              ${V(t)} ${e("detail.delete")}
            </button>
          </div>
        </div>
      </section>

      ${r.notes ? D`<section class="card block">
              <h3>${e("detail.notes")}</h3>
              <p class="notes">${r.notes}</p>
            </section>` : A}

      <section class="card block">
        <h3>${e("detail.growth")}</h3>
        ${o.length ? D`<pg-growth-chart
                .hass=${this.hass}
                .measurements=${o}
              ></pg-growth-chart>` : D`<p class="muted">${e("detail.no_measurements")}</p>`}
        ${o.length ? this._renderMeasurementList() : A}
        <form class="measure" @submit=${this._addMeasurement}>
          <label class="field">
            <span>${e("detail.measured_on")}</span>
            <input
              type="date"
              .value=${this._mDate}
              @input=${(e) => this._mDate = e.target.value}
            />
          </label>
          <label class="field">
            <span>${e("form.height_cm")}</span>
            <input
              type="number"
              min="0"
              inputmode="decimal"
              .value=${this._mHeight}
              @input=${(e) => this._mHeight = e.target.value}
            />
          </label>
          <label class="field">
            <span>${e("form.width_cm")}</span>
            <input
              type="number"
              min="0"
              inputmode="decimal"
              .value=${this._mWidth}
              @input=${(e) => this._mWidth = e.target.value}
            />
          </label>
          <button class="button secondary" type="submit">${e("detail.add_measurement")}</button>
          ${this._mError ? D`<p class="error-text" role="alert">${this._mError}</p>` : A}
        </form>
      </section>

      <section
        class="card block photos ${this._dragging ? "dragging" : ""}"
        @dragover=${this._onDragOver}
        @dragleave=${() => this._dragging = !1}
        @drop=${this._onDrop}
      >
        <div class="block-header">
          <h3>${e("detail.photos")}</h3>
          <button
            class="button text"
            @click=${this._pickFiles}
            ?disabled=${!!this._uploading}
          >
            ${V(n)} ${e("detail.add_photos")}
          </button>
        </div>
        ${this._uploading ? D`<p class="muted" aria-live="polite">${this._uploading}</p>` : A}
        ${this._uploadErrors.length ? D`<ul class="error-text" role="alert">
                ${this._uploadErrors.map((e) => D`<li>${e}</li>`)}
              </ul>` : A}
        ${a.length ? this._renderTimeline(a, s?.id ?? null) : D`<p class="muted">${e("detail.no_photos")}</p>`}
        ${this._dragging ? D`<div class="drop-hint">${e("detail.drop_photos")}</div>` : A}
      </section>

      <input
        id="file-input"
        class="sr-only"
        type="file"
        accept="image/*"
        multiple
        @change=${this._onFileInput}
      />
      <pg-plant-form .hass=${this.hass} @plant-saved=${() => this._load()}></pg-plant-form>
      <pg-photo-viewer
        .hass=${this.hass}
        .photos=${a}
        .plantId=${r.id}
        .coverId=${s?.id ?? null}
        @photos-changed=${() => this._load()}
      ></pg-photo-viewer>
      <pg-confirm-dialog .hass=${this.hass}></pg-confirm-dialog>
    `;
	}
	_renderMeasurementList() {
		let { t: e, language: n } = this, r = [...this._detail?.measurements ?? []].reverse();
		return D`<table>
      <thead>
        <tr>
          <th>${e("detail.measured_on")}</th>
          <th>${e("field.height")}</th>
          <th>${e("field.width")}</th>
          <th><span class="sr-only">${e("common.delete")}</span></th>
        </tr>
      </thead>
      <tbody>
        ${r.map((r) => D`<tr>
              <td>${K(r.measured_on, n)}</td>
              <td>${q(r.height_cm, n) || "–"}</td>
              <td>${q(r.width_cm, n) || "–"}</td>
              <td class="row-action">
                <button
                  class="icon-button"
                  @click=${() => this._deleteMeasurement(r.id)}
                  aria-label=${e("detail.delete_measurement")}
                  title=${e("detail.delete_measurement")}
                >
                  ${V(t)}
                </button>
              </td>
            </tr>`)}
      </tbody>
    </table>`;
	}
	_renderTimeline(e, t) {
		let { t: n, language: r } = this;
		return Jt(e).map((e) => D`<div class="month">
          <h4>${st(e.photos[0]?.taken_at ?? "", r)}</h4>
          <div class="thumbs">
            ${e.photos.map((e) => D`<button
                  class="thumb"
                  @click=${() => this._openPhoto(e)}
                  aria-label=${n("viewer.taken", { date: K(e.taken_at, r) })}
                >
                  <img src=${e.urls.thumb} alt="" loading="lazy" decoding="async" />
                  ${e.id === t ? D`<span class="star">${V(a)}</span>` : A}
                  ${e.tags.length ? D`<span class="tags">
                          ${e.tags.map((e) => D`<span class="tag ${e === "problem" ? "problem" : ""}"
                                >${ht(e, n)}</span
                              >`)}
                        </span>` : A}
                </button>`)}
          </div>
        </div>`);
	}
	static {
		this.styles = [U, f`
      :host {
        display: grid;
        gap: 16px;
      }
      .loading,
      .message {
        text-align: center;
        padding: 32px 16px;
      }
      .hero {
        display: grid;
        grid-template-columns: minmax(240px, 400px) 1fr;
        overflow: hidden;
      }
      .cover {
        all: unset;
        display: block;
        aspect-ratio: 4 / 3;
        background: var(--pg-leaf-soft);
        cursor: zoom-in;
      }
      .cover:disabled {
        cursor: default;
      }
      .cover:focus-visible {
        outline: 2px solid var(--pg-accent);
        outline-offset: -2px;
      }
      .cover img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .placeholder {
        display: grid;
        place-items: center;
        height: 100%;
        color: var(--pg-leaf);
      }
      .placeholder .icon {
        width: 64px;
        height: 64px;
        opacity: 0.6;
      }
      .summary {
        display: grid;
        align-content: start;
        gap: 6px;
        padding: 20px 24px;
        min-width: 0;
      }
      .title-row {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 4px 14px;
      }
      h2 {
        margin: 0;
        font-size: 26px;
        font-weight: 500;
      }
      .latin {
        margin: 0;
        font-style: italic;
        color: var(--pg-text-muted);
      }
      .family {
        margin: 0;
        font-size: 13px;
      }
      .facts {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 12px 20px;
        margin: 12px 0 8px;
      }
      dt {
        font-size: 12px;
        color: var(--pg-text-muted);
      }
      dd {
        margin: 2px 0 0;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .source .icon {
        width: 14px;
        height: 14px;
        color: var(--pg-text-muted);
        opacity: 0.7;
      }
      .source-ai .icon {
        color: var(--pg-accent);
        opacity: 1;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 8px;
      }
      .block {
        position: relative;
        padding: 16px 20px 20px;
      }
      .block h3 {
        margin: 0 0 12px;
        font-size: 18px;
        font-weight: 500;
      }
      .block-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .block-header h3 {
        margin: 0;
      }
      .notes {
        margin: 0;
        white-space: pre-wrap;
        line-height: 1.5;
      }
      table {
        width: 100%;
        margin-top: 12px;
        border-collapse: collapse;
        font-size: 14px;
      }
      th {
        text-align: left;
        font-size: 12px;
        font-weight: 500;
        color: var(--pg-text-muted);
        padding: 4px 8px;
      }
      td {
        padding: 2px 8px;
        border-top: 1px solid var(--pg-divider);
      }
      .row-action {
        width: 48px;
        text-align: right;
      }
      .row-action .icon-button {
        width: 32px;
        height: 32px;
        color: var(--pg-text-muted);
      }
      .row-action .icon {
        width: 18px;
        height: 18px;
      }
      .measure {
        display: grid;
        grid-template-columns: repeat(3, minmax(110px, 1fr)) auto;
        align-items: end;
        gap: 12px;
        margin-top: 16px;
      }
      .measure .error-text {
        grid-column: 1 / -1;
        margin: 0;
      }
      .month h4 {
        margin: 16px 0 8px;
        font-size: 13px;
        font-weight: 600;
        color: var(--pg-text-muted);
      }
      .thumbs {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 8px;
      }
      .thumb {
        all: unset;
        position: relative;
        aspect-ratio: 1;
        border-radius: 10px;
        overflow: hidden;
        background: var(--pg-leaf-soft);
        cursor: zoom-in;
      }
      .thumb:focus-visible {
        outline: 2px solid var(--pg-accent);
        outline-offset: 2px;
      }
      .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 200ms ease;
      }
      .thumb:hover img {
        transform: scale(1.04);
      }
      .star {
        position: absolute;
        top: 6px;
        right: 6px;
        color: #ffd54f;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
      }
      .star .icon {
        width: 18px;
        height: 18px;
      }
      .tags {
        position: absolute;
        left: 6px;
        bottom: 6px;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .tag {
        padding: 1px 7px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.55);
        color: #fff;
        font-size: 11px;
      }
      .tag.problem {
        background: var(--error-color, #db4437);
      }
      .photos.dragging {
        outline: 2px dashed var(--pg-accent);
        outline-offset: -6px;
      }
      .drop-hint {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        border-radius: inherit;
        background: color-mix(in srgb, var(--pg-surface) 85%, transparent);
        color: var(--pg-accent);
        font-weight: 500;
        pointer-events: none;
      }
      @media (max-width: 760px) {
        .hero {
          grid-template-columns: 1fr;
        }
        .summary {
          padding: 16px;
        }
        .measure {
          grid-template-columns: 1fr 1fr;
        }
        .measure .button {
          grid-column: 1 / -1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .thumb img {
          transition: none;
        }
        .thumb:hover img {
          transform: none;
        }
      }
    `];
	}
});
// src/components/hero.ts
var Yt = D`
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
`, Xt = f`
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
`;
// src/components/plant-card.ts
function $(e, t = "/plant-garden") {
	return `${t}/plants/${e.id}`;
}
H("pg-plant-card", class extends B {
	static {
		this.properties = {
			plant: { attribute: !1 },
			prefix: {}
		};
	}
	constructor() {
		super(), this.prefix = "/plant-garden";
	}
	_open(e) {
		e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || (e.preventDefault(), W($(this.plant, this.prefix)));
	}
	render() {
		let { plant: e, t } = this, n = ut(e.age_months_now, t), r = q(e.height_cm, this.language), a = [e.scientific_name, e.variety && `'${e.variety}'`].filter(Boolean).join(" ");
		return D`
      <a class="card" href=${$(e, this.prefix)} @click=${this._open}>
        <div class="cover">
          ${e.cover ? D`<img
                  src=${e.cover.urls.thumb}
                  srcset="${e.cover.urls.thumb} 360w, ${e.cover.urls.medium} 1024w"
                  sizes="(max-width: 600px) 50vw, 280px"
                  alt=""
                  loading="lazy"
                  decoding="async"
                />` : D`<div class="placeholder">${V(i)}</div>`}
          ${e.status === "healthy" ? A : D`<span class="badge status status-${e.status}"
                  >${t(`status.${e.status}`)}</span
                >`}
        </div>
        <div class="body">
          <h3>${e.name}</h3>
          ${a ? D`<p class="latin">${a}</p>` : A}
          <p class="meta">
            <span>${t(`category.${e.category}`)}</span>
            ${n ? D`<span>${n}</span>` : A}
            ${r ? D`<span>${V("M3,5V21H9V19.5H7V18H9V16.5H5V15H9V13.5H7V12H9V10.5H5V9H9V5H10.5V9H12V7H13.5V9H15V5H16.5V9H18V7H19.5V9H21V3H5A2,2 0 0,0 3,5M6,7A1,1 0 0,1 5,6A1,1 0 0,1 6,5A1,1 0 0,1 7,6A1,1 0 0,1 6,7Z")}${r}</span>` : A}
            ${e.photo_count ? D`<span
                    >${V("M20,4H16.83L15,2H9L7.17,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6A2,2 0 0,0 20,4M20,18H4V6H8.05L9.88,4H14.12L15.95,6H20V18M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15Z")}${t(e.photo_count === 1 ? "plants.photos_one" : "plants.photos_other", { n: e.photo_count })}</span
                  >` : A}
          </p>
        </div>
      </a>
    `;
	}
	static {
		this.styles = [U, f`
      :host {
        display: block;
      }
      a {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        color: inherit;
        text-decoration: none;
        transition:
          transform 160ms ease,
          box-shadow 160ms ease;
      }
      a:hover {
        transform: translateY(-2px);
        box-shadow:
          0 4px 16px rgba(0, 0, 0, 0.12),
          0 1px 3px rgba(0, 0, 0, 0.08);
      }
      a:focus-visible {
        outline: 2px solid var(--pg-accent);
        outline-offset: 2px;
      }
      .cover {
        position: relative;
        aspect-ratio: 4 / 3;
        background: var(--pg-leaf-soft);
      }
      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .placeholder {
        display: grid;
        place-items: center;
        height: 100%;
        color: var(--pg-leaf);
      }
      .placeholder .icon {
        width: 48px;
        height: 48px;
        opacity: 0.7;
      }
      .badge {
        position: absolute;
        top: 8px;
        left: 8px;
        padding: 3px 10px;
        border-radius: 999px;
        background: var(--pg-surface);
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
        font-weight: 500;
      }
      .body {
        padding: 12px 14px 14px;
        display: grid;
        gap: 2px;
      }
      h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .latin {
        margin: 0;
        font-style: italic;
        font-size: 13px;
        color: var(--pg-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 12px;
        margin: 6px 0 0;
        font-size: 12px;
        color: var(--pg-text-muted);
      }
      .meta span {
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }
      .meta .icon {
        width: 14px;
        height: 14px;
      }
      @media (prefers-reduced-motion: reduce) {
        a,
        a:hover {
          transition: none;
          transform: none;
        }
      }
    `];
	}
});
// src/views/plants-view.ts
function Zt(e, t) {
	let n = t.trim().toLocaleLowerCase();
	return !n || [
		e.name,
		e.scientific_name,
		e.variety,
		e.family,
		...e.tags
	].filter((e) => !!e).some((e) => e.toLocaleLowerCase().includes(n));
}
H("pg-plants-view", class extends B {
	static {
		this.properties = {
			store: { attribute: !1 },
			gardenName: { attribute: !1 },
			prefix: {},
			_query: { state: !0 },
			_status: { state: !0 }
		};
	}
	constructor() {
		super(), this._onStoreChange = () => this.requestUpdate(), this.prefix = "/plant-garden", this.gardenName = "", this._query = "", this._status = "all";
	}
	connectedCallback() {
		super.connectedCallback(), this.store?.addEventListener("change", this._onStoreChange);
	}
	disconnectedCallback() {
		super.disconnectedCallback(), this.store?.removeEventListener("change", this._onStoreChange);
	}
	_openForm() {
		this.renderRoot.querySelector("pg-plant-form")?.open();
	}
	_onSaved(e) {
		this.store.refresh(), e.detail.created && W($(e.detail.plant, this.prefix));
	}
	render() {
		let { t: e } = this, t = this.store.plants, n = St.filter((e) => t.some((t) => t.status === e)), i = t.filter((e) => (this._status === "all" || e.status === this._status) && Zt(e, this._query));
		return D`
      ${t.length ? D`
              <div class="filters">
                <label class="search">
                  ${V("M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z")}
                  <span class="sr-only">${e("plants.search")}</span>
                  <input
                    type="search"
                    placeholder=${e("plants.search")}
                    .value=${this._query}
                    @input=${(e) => this._query = e.target.value}
                  />
                </label>
                ${n.length > 1 ? D`<div class="chips" role="group">
                        <button
                          class="chip"
                          aria-pressed=${this._status === "all"}
                          @click=${() => this._status = "all"}
                        >
                          ${e("plants.filter_all")} · ${t.length}
                        </button>
                        ${n.map((t) => D`<button
                              class="chip"
                              aria-pressed=${this._status === t}
                              @click=${() => this._status = t}
                            >
                              <span class="status status-${t}">${e(`status.${t}`)}</span>
                            </button>`)}
                      </div>` : A}
              </div>
              ${i.length ? D`<div class="grid">
                      ${i.map((e) => D`<pg-plant-card
                            .hass=${this.hass}
                            .plant=${e}
                            .prefix=${this.prefix}
                          ></pg-plant-card>`)}
                    </div>` : D`<p class="muted empty-search">${e("plants.no_results")}</p>`}
            ` : D`
              <section class="card hero welcome">
                ${Yt}
                <div class="welcome-text">
                  <h2>${e("plants.empty_title", { garden: this.gardenName })}</h2>
                  <p class="muted">${e("plants.empty_body")}</p>
                  <button class="button" @click=${this._openForm}>
                    ${V(r)} ${e("plants.add")}
                  </button>
                </div>
              </section>
            `}
      ${t.length ? D`<button class="button fab" @click=${this._openForm} aria-label=${e("plants.add")}>
              ${V(r)} <span>${e("plants.add")}</span>
            </button>` : A}
      <pg-plant-form .hass=${this.hass} @plant-saved=${this._onSaved}></pg-plant-form>
    `;
	}
	static {
		this.styles = [
			U,
			Xt,
			f`
      :host {
        display: block;
        padding-bottom: 88px;
      }
      .filters {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }
      .search {
        position: relative;
        flex: 1 1 240px;
        max-width: 420px;
      }
      .search .icon {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        width: 20px;
        height: 20px;
        color: var(--pg-text-muted);
      }
      .search input {
        padding-left: 38px;
        border-radius: 999px;
        background: var(--pg-surface);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 16px;
      }
      .empty-search {
        text-align: center;
        padding: 32px 0;
      }
      .welcome {
        overflow: hidden;
      }
      .welcome svg {
        display: block;
        width: 100%;
        height: auto;
        max-height: 240px;
      }
      .welcome-text {
        padding: 8px 24px 24px;
        display: grid;
        gap: 8px;
        justify-items: start;
      }
      .welcome h2 {
        margin: 8px 0 0;
        font-size: 26px;
        font-weight: 500;
      }
      .welcome p {
        margin: 0 0 8px;
        max-width: 60ch;
        line-height: 1.5;
      }
      .fab {
        position: fixed;
        right: max(24px, env(safe-area-inset-right));
        bottom: max(24px, env(safe-area-inset-bottom));
        min-height: 56px;
        padding: 0 22px;
        border-radius: 16px;
        box-shadow:
          0 4px 12px rgba(0, 0, 0, 0.18),
          0 1px 3px rgba(0, 0, 0, 0.12);
        z-index: 2;
      }
      @media (max-width: 600px) {
        .grid {
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 12px;
        }
        .fab span {
          display: none;
        }
        .fab {
          padding: 0 16px;
        }
      }
    `
		];
	}
});
// src/panel.ts
var Qt = 9e5;
function $t(e) {
	let t = /^\/plants\/([0-9A-Za-z]+)\/?$/.exec(e ?? "");
	return t?.[1] ? {
		name: "plant",
		plantId: t[1]
	} : { name: "plants" };
}
var en = class extends L {
	constructor(...e) {
		super(...e), this._store = new it(() => this.hass), this._started = !1, this._localize = tt("en"), this._language = "", this._onStoreChange = () => this.requestUpdate(), this._refreshIfStale = () => {
			document.visibilityState === "visible" && this._store.stale && this._store.refresh();
		};
	}
	static {
		this.properties = {
			hass: { attribute: !1 },
			narrow: { type: Boolean },
			route: { attribute: !1 },
			panel: { attribute: !1 },
			_info: { state: !0 },
			_infoError: { state: !0 }
		};
	}
	connectedCallback() {
		super.connectedCallback(), this._store.addEventListener("change", this._onStoreChange), document.addEventListener("visibilitychange", this._refreshIfStale), this._freshnessTimer = setInterval(this._refreshIfStale, Qt), this.hass && this._start();
	}
	disconnectedCallback() {
		super.disconnectedCallback(), this._store.removeEventListener("change", this._onStoreChange), document.removeEventListener("visibilitychange", this._refreshIfStale), clearInterval(this._freshnessTimer), this._store.disconnect(), this._started = !1;
	}
	willUpdate(e) {
		if (!e.has("hass") || !this.hass) return;
		let t = this.hass.locale?.language ?? this.hass.language;
		t !== this._language && (this._language = t, this._localize = tt(t)), this.toggleAttribute("dark", !!this.hass.themes?.darkMode), !this._started && this.isConnected && this._start();
	}
	_start() {
		this._started = !0, this._loadInfo(), this._store.connect();
	}
	async _loadInfo() {
		try {
			this._info = await Le(this.hass), this._infoError = void 0;
		} catch (e) {
			this._infoError = z(e);
		}
	}
	_retry() {
		this._loadInfo(), this._store.connect().then(() => this._store.refresh());
	}
	get _prefix() {
		return this.route?.prefix ?? `/${this.panel?.url_path ?? "plant-garden"}`;
	}
	_toggleSidebar() {
		this.dispatchEvent(new Event("hass-toggle-menu", {
			bubbles: !0,
			composed: !0
		}));
	}
	render() {
		let e = this._localize, t = $t(this.route?.path), n = this._info?.garden_name ?? this.panel?.title ?? "Plant Garden", r = t.name === "plant" ? this._store.getPlant(t.plantId)?.name ?? n : n;
		return D`
      <header class="toolbar">
        ${t.name === "plant" ? D`<button
                class="icon-button"
                @click=${() => W(this._prefix)}
                aria-label=${e("panel.back")}
                title=${e("panel.back")}
              >
                ${V("M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z")}
              </button>` : this.narrow ? D`<button
                  class="icon-button"
                  @click=${this._toggleSidebar}
                  aria-label=${e("panel.open_sidebar")}
                  title=${e("panel.open_sidebar")}
                >
                  ${V("M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z")}
                </button>` : A}
        <h1>${r}</h1>
      </header>
      <main>${this._renderBody(e, t, n)}</main>
    `;
	}
	_renderBody(e, t, n) {
		let r = this._infoError ?? (this._store.loaded ? void 0 : this._store.error);
		return r ? D`
        <section class="card state" role="alert">
          ${V("M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z")}
          <h2>${e("panel.error_title")}</h2>
          <p class="muted">${r}</p>
          <p class="muted">${e("panel.error_hint")}</p>
          <button class="button" @click=${this._retry}>
            ${V("M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z")} ${e("panel.retry")}
          </button>
        </section>
      ` : !this._store.loaded || !this._info ? D`<p class="muted loading" aria-live="polite">${e("panel.loading")}</p>` : t.name === "plant" ? D`<pg-plant-detail
        .hass=${this.hass}
        .store=${this._store}
        .plantId=${t.plantId}
        .prefix=${this._prefix}
      ></pg-plant-detail>` : D`<pg-plants-view
      .hass=${this.hass}
      .store=${this._store}
      .gardenName=${n}
      .prefix=${this._prefix}
    ></pg-plants-view>`;
	}
	static {
		this.styles = [
			at,
			U,
			f`
      :host {
        display: block;
        min-height: 100%;
        background: var(--pg-bg);
        color: var(--pg-text);
        font-family: var(--pg-font);
        -webkit-font-smoothing: antialiased;
      }
      .toolbar {
        position: sticky;
        top: 0;
        z-index: 3;
        display: flex;
        align-items: center;
        gap: 4px;
        height: var(--header-height, 56px);
        padding: 0 12px;
        background: var(--app-header-background-color, var(--pg-accent));
        color: var(--app-header-text-color, #fff);
        border-bottom: var(--app-header-border-bottom, none);
      }
      .toolbar h1 {
        margin: 0 0 0 8px;
        font-size: 20px;
        font-weight: 400;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      main {
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px 16px 32px;
      }
      .loading {
        text-align: center;
        padding: 48px 0;
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
      .state .button {
        margin-top: 12px;
      }
    `
		];
	}
};
// src/main.ts
customElements.get("plant-garden-panel") || customElements.define("plant-garden-panel", en);
