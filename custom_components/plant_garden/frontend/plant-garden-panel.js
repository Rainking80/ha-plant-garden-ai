// node_modules/@mdi/js/mdi.js
var e = "M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z", t = "M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19M8,9H16V19H8V9M15.5,4L14.5,3H9.5L8.5,4H5V6H19V4H15.5Z", n = "M13 19C13 19.7 13.13 20.37 13.35 21H5C3.9 21 3 20.11 3 19V5C3 3.9 3.9 3 5 3H19C20.11 3 21 3.9 21 5V13.35C20.37 13.13 19.7 13 19 13V5H5V19H13M13.96 12.29L11.21 15.83L9.25 13.47L6.5 17H13.35C13.75 15.88 14.47 14.91 15.4 14.21L13.96 12.29M20 18V15H18V18H15V20H18V23H20V20H23V18H20Z", r = "M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z", i = "M14,3V5H17.59L7.76,14.83L9.17,16.24L19,6.41V10H21V3M19,19H5V5H12V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V12H19V19Z", a = "M14.06,9L15,9.94L5.92,19H5V18.08L14.06,9M17.66,3C17.41,3 17.15,3.1 16.96,3.29L15.13,5.12L18.88,8.87L20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18.17,3.09 17.92,3 17.66,3M14.06,6.19L3,17.25V21H6.75L17.81,9.94L14.06,6.19Z", o = "M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z", s = "M2,22V20C2,20 7,18 12,18C17,18 22,20 22,20V22H2M11.3,9.1C10.1,5.2 4,6.1 4,6.1C4,6.1 4.2,13.9 9.9,12.7C9.5,9.8 8,9 8,9C10.8,9 11,12.4 11,12.4V17C11.3,17 11.7,17 12,17C12.3,17 12.7,17 13,17V12.8C13,12.8 13,8.9 16,7.9C16,7.9 14,10.9 14,12.9C21,13.6 21,4 21,4C21,4 12.1,3 11.3,9.1Z", c = "M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z", l = globalThis, u = l.ShadowRoot && (l.ShadyCSS === void 0 || l.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, d = Symbol(), f = /* @__PURE__ */ new WeakMap(), p = class {
	constructor(e, t, n) {
		if (this._$cssResult$ = !0, n !== d) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
		this.cssText = e, this.t = t;
	}
	get styleSheet() {
		let e = this.o, t = this.t;
		if (u && e === void 0) {
			let n = t !== void 0 && t.length === 1;
			n && (e = f.get(t)), e === void 0 && ((this.o = e = new CSSStyleSheet()).replaceSync(this.cssText), n && f.set(t, e));
		}
		return e;
	}
	toString() {
		return this.cssText;
	}
}, m = (e) => new p(typeof e == "string" ? e : e + "", void 0, d), h = (e, ...t) => new p(e.length === 1 ? e[0] : t.reduce((t, n, r) => t + ((e) => {
	if (!0 === e._$cssResult$) return e.cssText;
	if (typeof e == "number") return e;
	throw Error("Value passed to 'css' function must be a 'css' function result: " + e + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
})(n) + e[r + 1], e[0]), e, d), ee = (e, t) => {
	if (u) e.adoptedStyleSheets = t.map((e) => e instanceof CSSStyleSheet ? e : e.styleSheet);
	else for (let n of t) {
		let t = document.createElement("style"), r = l.litNonce;
		r !== void 0 && t.setAttribute("nonce", r), t.textContent = n.cssText, e.appendChild(t);
	}
}, te = u ? (e) => e : (e) => e instanceof CSSStyleSheet ? ((e) => {
	let t = "";
	for (let n of e.cssRules) t += n.cssText;
	return m(t);
})(e) : e, { is: ne, defineProperty: re, getOwnPropertyDescriptor: ie, getOwnPropertyNames: ae, getOwnPropertySymbols: oe, getPrototypeOf: se } = Object, ce = globalThis, le = ce.trustedTypes, ue = le ? le.emptyScript : "", de = ce.reactiveElementPolyfillSupport, g = (e, t) => e, fe = {
	toAttribute(e, t) {
		switch (t) {
			case Boolean:
				e = e ? ue : null;
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
}, pe = (e, t) => !ne(e, t), me = {
	attribute: !0,
	type: String,
	converter: fe,
	reflect: !1,
	useDefault: !1,
	hasChanged: pe
};
Symbol.metadata ??= Symbol("metadata"), ce.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
var _ = class extends HTMLElement {
	static addInitializer(e) {
		this._$Ei(), (this.l ??= []).push(e);
	}
	static get observedAttributes() {
		return this.finalize(), this._$Eh && [...this._$Eh.keys()];
	}
	static createProperty(e, t = me) {
		if (t.state && (t.attribute = !1), this._$Ei(), this.prototype.hasOwnProperty(e) && ((t = Object.create(t)).wrapped = !0), this.elementProperties.set(e, t), !t.noAccessor) {
			let n = Symbol(), r = this.getPropertyDescriptor(e, n, t);
			r !== void 0 && re(this.prototype, e, r);
		}
	}
	static getPropertyDescriptor(e, t, n) {
		let { get: r, set: i } = ie(this.prototype, e) ?? {
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
		return this.elementProperties.get(e) ?? me;
	}
	static _$Ei() {
		if (this.hasOwnProperty(g("elementProperties"))) return;
		let e = se(this);
		e.finalize(), e.l !== void 0 && (this.l = [...e.l]), this.elementProperties = new Map(e.elementProperties);
	}
	static finalize() {
		if (this.hasOwnProperty(g("finalized"))) return;
		if (this.finalized = !0, this._$Ei(), this.hasOwnProperty(g("properties"))) {
			let e = this.properties, t = [...ae(e), ...oe(e)];
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
			for (let e of n) t.unshift(te(e));
		} else e !== void 0 && t.push(te(e));
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
		return ee(e, this.constructor.elementStyles), e;
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
			let i = (n.converter?.toAttribute === void 0 ? fe : n.converter).toAttribute(t, n.type);
			this._$Em = e, i == null ? this.removeAttribute(r) : this.setAttribute(r, i), this._$Em = null;
		}
	}
	_$AK(e, t) {
		let n = this.constructor, r = n._$Eh.get(e);
		if (r !== void 0 && this._$Em !== r) {
			let e = n.getPropertyOptions(r), i = typeof e.converter == "function" ? { fromAttribute: e.converter } : e.converter?.fromAttribute === void 0 ? fe : e.converter;
			this._$Em = r;
			let a = i.fromAttribute(t, e.type);
			this[r] = a ?? this._$Ej?.get(r) ?? a, this._$Em = null;
		}
	}
	requestUpdate(e, t, n, r = !1, i) {
		if (e !== void 0) {
			let a = this.constructor;
			if (!1 === r && (i = this[e]), n ??= a.getPropertyOptions(e), !((n.hasChanged ?? pe)(i, t) || n.useDefault && n.reflect && i === this._$Ej?.get(e) && !this.hasAttribute(a._$Eu(e, n)))) return;
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
_.elementStyles = [], _.shadowRootOptions = { mode: "open" }, _[g("elementProperties")] = /* @__PURE__ */ new Map(), _[g("finalized")] = /* @__PURE__ */ new Map(), de?.({ ReactiveElement: _ }), (ce.reactiveElementVersions ??= []).push("2.1.2");
// node_modules/lit-html/lit-html.js
var he = globalThis, ge = (e) => e, _e = he.trustedTypes, ve = _e ? _e.createPolicy("lit-html", { createHTML: (e) => e }) : void 0, ye = "$lit$", v = `lit$${Math.random().toFixed(9).slice(2)}$`, be = "?" + v, xe = `<${be}>`, y = document, b = () => y.createComment(""), x = (e) => e === null || typeof e != "object" && typeof e != "function", Se = Array.isArray, Ce = (e) => Se(e) || typeof e?.[Symbol.iterator] == "function", we = "[ 	\n\f\r]", S = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, Te = /-->/g, Ee = />/g, C = RegExp(`>|${we}(?:([^\\s"'>=/]+)(${we}*=${we}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`, "g"), De = /'/g, Oe = /"/g, ke = /^(?:script|style|textarea|title)$/i, Ae = (e) => (t, ...n) => ({
	_$litType$: e,
	strings: t,
	values: n
}), w = Ae(1), T = Ae(2), E = Symbol.for("lit-noChange"), D = Symbol.for("lit-nothing"), je = /* @__PURE__ */ new WeakMap(), O = y.createTreeWalker(y, 129);
function Me(e, t) {
	if (!Se(e) || !e.hasOwnProperty("raw")) throw Error("invalid template strings array");
	return ve === void 0 ? t : ve.createHTML(t);
}
var Ne = (e, t) => {
	let n = e.length - 1, r = [], i, a = t === 2 ? "<svg>" : t === 3 ? "<math>" : "", o = S;
	for (let t = 0; t < n; t++) {
		let n = e[t], s, c, l = -1, u = 0;
		for (; u < n.length && (o.lastIndex = u, c = o.exec(n), c !== null);) u = o.lastIndex, o === S ? c[1] === "!--" ? o = Te : c[1] === void 0 ? c[2] === void 0 ? c[3] !== void 0 && (o = C) : (ke.test(c[2]) && (i = RegExp("</" + c[2], "g")), o = C) : o = Ee : o === C ? c[0] === ">" ? (o = i ?? S, l = -1) : c[1] === void 0 ? l = -2 : (l = o.lastIndex - c[2].length, s = c[1], o = c[3] === void 0 ? C : c[3] === "\"" ? Oe : De) : o === Oe || o === De ? o = C : o === Te || o === Ee ? o = S : (o = C, i = void 0);
		let d = o === C && e[t + 1].startsWith("/>") ? " " : "";
		a += o === S ? n + xe : l >= 0 ? (r.push(s), n.slice(0, l) + ye + n.slice(l) + v + d) : n + v + (l === -2 ? t : d);
	}
	return [Me(e, a + (e[n] || "<?>") + (t === 2 ? "</svg>" : t === 3 ? "</math>" : "")), r];
}, Pe = class e {
	constructor({ strings: t, _$litType$: n }, r) {
		let i;
		this.parts = [];
		let a = 0, o = 0, s = t.length - 1, c = this.parts, [l, u] = Ne(t, n);
		if (this.el = e.createElement(l, r), O.currentNode = this.el.content, n === 2 || n === 3) {
			let e = this.el.content.firstChild;
			e.replaceWith(...e.childNodes);
		}
		for (; (i = O.nextNode()) !== null && c.length < s;) {
			if (i.nodeType === 1) {
				if (i.hasAttributes()) for (let e of i.getAttributeNames()) if (e.endsWith(ye)) {
					let t = u[o++], n = i.getAttribute(e).split(v), r = /([.?@])?(.*)/.exec(t);
					c.push({
						type: 1,
						index: a,
						name: r[2],
						strings: n,
						ctor: r[1] === "." ? Ie : r[1] === "?" ? Le : r[1] === "@" ? Re : j
					}), i.removeAttribute(e);
				} else e.startsWith(v) && (c.push({
					type: 6,
					index: a
				}), i.removeAttribute(e));
				if (ke.test(i.tagName)) {
					let e = i.textContent.split(v), t = e.length - 1;
					if (t > 0) {
						i.textContent = _e ? _e.emptyScript : "";
						for (let n = 0; n < t; n++) i.append(e[n], b()), O.nextNode(), c.push({
							type: 2,
							index: ++a
						});
						i.append(e[t], b());
					}
				}
			} else if (i.nodeType === 8) {
				if (i.data === be) c.push({
					type: 2,
					index: a
				});
				else {
					let e = -1;
					for (; (e = i.data.indexOf(v, e + 1)) !== -1;) c.push({
						type: 7,
						index: a
					}), e += v.length - 1;
				}
			}
			a++;
		}
	}
	static createElement(e, t) {
		let n = y.createElement("template");
		return n.innerHTML = e, n;
	}
};
function k(e, t, n = e, r) {
	if (t === E) return t;
	let i = r === void 0 ? n._$Cl : n._$Co?.[r], a = x(t) ? void 0 : t._$litDirective$;
	return i?.constructor !== a && (i?._$AO?.(!1), a === void 0 ? i = void 0 : (i = new a(e), i._$AT(e, n, r)), r === void 0 ? n._$Cl = i : (n._$Co ??= [])[r] = i), i !== void 0 && (t = k(e, i._$AS(e, t.values), i, r)), t;
}
var Fe = class {
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
		let { el: { content: t }, parts: n } = this._$AD, r = (e?.creationScope ?? y).importNode(t, !0);
		O.currentNode = r;
		let i = O.nextNode(), a = 0, o = 0, s = n[0];
		for (; s !== void 0;) {
			if (a === s.index) {
				let t;
				s.type === 2 ? t = new A(i, i.nextSibling, this, e) : s.type === 1 ? t = new s.ctor(i, s.name, s.strings, this, e) : s.type === 6 && (t = new ze(i, this, e)), this._$AV.push(t), s = n[++o];
			}
			a !== s?.index && (i = O.nextNode(), a++);
		}
		return O.currentNode = y, r;
	}
	p(e) {
		let t = 0;
		for (let n of this._$AV) n !== void 0 && (n.strings === void 0 ? n._$AI(e[t]) : (n._$AI(e, n, t), t += n.strings.length - 2)), t++;
	}
}, A = class e {
	get _$AU() {
		return this._$AM?._$AU ?? this._$Cv;
	}
	constructor(e, t, n, r) {
		this.type = 2, this._$AH = D, this._$AN = void 0, this._$AA = e, this._$AB = t, this._$AM = n, this.options = r, this._$Cv = r?.isConnected ?? !0;
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
		e = k(this, e, t), x(e) ? e === D || e == null || e === "" ? (this._$AH !== D && this._$AR(), this._$AH = D) : e !== this._$AH && e !== E && this._(e) : e._$litType$ === void 0 ? e.nodeType === void 0 ? Ce(e) ? this.k(e) : this._(e) : this.T(e) : this.$(e);
	}
	O(e) {
		return this._$AA.parentNode.insertBefore(e, this._$AB);
	}
	T(e) {
		this._$AH !== e && (this._$AR(), this._$AH = this.O(e));
	}
	_(e) {
		this._$AH !== D && x(this._$AH) ? this._$AA.nextSibling.data = e : this.T(y.createTextNode(e)), this._$AH = e;
	}
	$(e) {
		let { values: t, _$litType$: n } = e, r = typeof n == "number" ? this._$AC(e) : (n.el === void 0 && (n.el = Pe.createElement(Me(n.h, n.h[0]), this.options)), n);
		if (this._$AH?._$AD === r) this._$AH.p(t);
		else {
			let e = new Fe(r, this), n = e.u(this.options);
			e.p(t), this.T(n), this._$AH = e;
		}
	}
	_$AC(e) {
		let t = je.get(e.strings);
		return t === void 0 && je.set(e.strings, t = new Pe(e)), t;
	}
	k(t) {
		Se(this._$AH) || (this._$AH = [], this._$AR());
		let n = this._$AH, r, i = 0;
		for (let a of t) i === n.length ? n.push(r = new e(this.O(b()), this.O(b()), this, this.options)) : r = n[i], r._$AI(a), i++;
		i < n.length && (this._$AR(r && r._$AB.nextSibling, i), n.length = i);
	}
	_$AR(e = this._$AA.nextSibling, t) {
		for (this._$AP?.(!1, !0, t); e !== this._$AB;) {
			let t = ge(e).nextSibling;
			ge(e).remove(), e = t;
		}
	}
	setConnected(e) {
		this._$AM === void 0 && (this._$Cv = e, this._$AP?.(e));
	}
}, j = class {
	get tagName() {
		return this.element.tagName;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	constructor(e, t, n, r, i) {
		this.type = 1, this._$AH = D, this._$AN = void 0, this.element = e, this.name = t, this._$AM = r, this.options = i, n.length > 2 || n[0] !== "" || n[1] !== "" ? (this._$AH = Array(n.length - 1).fill(/* @__PURE__ */ new String()), this.strings = n) : this._$AH = D;
	}
	_$AI(e, t = this, n, r) {
		let i = this.strings, a = !1;
		if (i === void 0) e = k(this, e, t, 0), a = !x(e) || e !== this._$AH && e !== E, a && (this._$AH = e);
		else {
			let r = e, o, s;
			for (e = i[0], o = 0; o < i.length - 1; o++) s = k(this, r[n + o], t, o), s === E && (s = this._$AH[o]), a ||= !x(s) || s !== this._$AH[o], s === D ? e = D : e !== D && (e += (s ?? "") + i[o + 1]), this._$AH[o] = s;
		}
		a && !r && this.j(e);
	}
	j(e) {
		e === D ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, e ?? "");
	}
}, Ie = class extends j {
	constructor() {
		super(...arguments), this.type = 3;
	}
	j(e) {
		this.element[this.name] = e === D ? void 0 : e;
	}
}, Le = class extends j {
	constructor() {
		super(...arguments), this.type = 4;
	}
	j(e) {
		this.element.toggleAttribute(this.name, !!e && e !== D);
	}
}, Re = class extends j {
	constructor(e, t, n, r, i) {
		super(e, t, n, r, i), this.type = 5;
	}
	_$AI(e, t = this) {
		if ((e = k(this, e, t, 0) ?? D) === E) return;
		let n = this._$AH, r = e === D && n !== D || e.capture !== n.capture || e.once !== n.once || e.passive !== n.passive, i = e !== D && (n === D || r);
		r && this.element.removeEventListener(this.name, this, n), i && this.element.addEventListener(this.name, this, e), this._$AH = e;
	}
	handleEvent(e) {
		typeof this._$AH == "function" ? this._$AH.call(this.options?.host ?? this.element, e) : this._$AH.handleEvent(e);
	}
}, ze = class {
	constructor(e, t, n) {
		this.element = e, this.type = 6, this._$AN = void 0, this._$AM = t, this.options = n;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	_$AI(e) {
		k(this, e);
	}
}, Be = {
	M: ye,
	P: v,
	A: be,
	C: 1,
	L: Ne,
	R: Fe,
	D: Ce,
	V: k,
	I: A,
	H: j,
	N: Le,
	U: Re,
	B: Ie,
	F: ze
}, Ve = he.litHtmlPolyfillSupport;
Ve?.(Pe, A), (he.litHtmlVersions ??= []).push("3.3.3");
var He = (e, t, n) => {
	let r = n?.renderBefore ?? t, i = r._$litPart$;
	if (i === void 0) {
		let e = n?.renderBefore ?? null;
		r._$litPart$ = i = new A(t.insertBefore(b(), e), e, void 0, n ?? {});
	}
	return i._$AI(e), i;
}, Ue = globalThis, M = class extends _ {
	constructor() {
		super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
	}
	createRenderRoot() {
		let e = super.createRenderRoot();
		return this.renderOptions.renderBefore ??= e.firstChild, e;
	}
	update(e) {
		let t = this.render();
		this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(e), this._$Do = He(t, this.renderRoot, this.renderOptions);
	}
	connectedCallback() {
		super.connectedCallback(), this._$Do?.setConnected(!0);
	}
	disconnectedCallback() {
		super.disconnectedCallback(), this._$Do?.setConnected(!1);
	}
	render() {
		return E;
	}
};
M._$litElement$ = !0, M.finalized = !0, Ue.litElementHydrateSupport?.({ LitElement: M });
var We = Ue.litElementPolyfillSupport;
We?.({ LitElement: M }), (Ue.litElementVersions ??= []).push("4.2.2");
// src/api/client.ts
var N = "plant_garden", Ge = "/api/plant_garden/photos";
function Ke(e) {
	return e.callWS({ type: `${N}/info` });
}
function P(e) {
	return e instanceof Error ? e.message : typeof e == "object" && e && "message" in e ? String(e.message) : String(e);
}
async function qe(e) {
	return (await e.callWS({ type: `${N}/plants/list` })).plants;
}
function Je(e, t) {
	return e.callWS({
		type: `${N}/plants/get`,
		plant_id: t
	});
}
function Ye(e, t) {
	return e.callWS({
		type: `${N}/plants/create`,
		...t
	});
}
function Xe(e, t, n) {
	return e.callWS({
		type: `${N}/plants/update`,
		plant_id: t,
		...n
	});
}
async function Ze(e, t) {
	await e.callWS({
		type: `${N}/plants/delete`,
		plant_id: t
	});
}
function Qe(e, t, n) {
	return e.callWS({
		type: `${N}/plants/set_cover`,
		plant_id: t,
		photo_id: n
	});
}
async function $e(e, t) {
	await e.callWS({
		type: `${N}/plants/move`,
		moves: t
	});
}
function et(e) {
	return e.callWS({ type: `${N}/layout/get` });
}
function tt(e, t) {
	return e.callWS({
		type: `${N}/layout/shapes/save`,
		shape: t
	});
}
async function nt(e, t) {
	await e.callWS({
		type: `${N}/layout/shapes/delete`,
		shape_id: t
	});
}
function rt(e, t) {
	return e.connection.subscribeMessage(t, { type: `${N}/subscribe` });
}
var it = class extends Error {
	constructor(e, t, n) {
		super(e), this.code = t, this.status = n;
	}
};
async function at(e, t) {
	let n = new FormData();
	n.append("plant_id", t.plantId), t.takenAt && n.append("taken_at", t.takenAt), t.tags?.length && n.append("tags", t.tags.join(",")), t.note && n.append("note", t.note), n.append("file", t.file, t.filename);
	let r = await e.fetchWithAuth(Ge, {
		method: "POST",
		body: n
	});
	if (!r.ok) {
		let e = null, t = r.statusText;
		try {
			let n = await r.json();
			e = n.code ?? null, t = n.message ?? t;
		} catch {}
		throw new it(t, e, r.status);
	}
	return await r.json();
}
function ot(e, t, n) {
	return e.callWS({
		type: `${N}/photos/update`,
		photo_id: t,
		...n
	});
}
async function st(e, t) {
	await e.callWS({
		type: `${N}/photos/delete`,
		photo_id: t
	});
}
function ct(e, t, n) {
	return e.callWS({
		type: `${N}/measurements/add`,
		plant_id: t,
		...n
	});
}
async function lt(e, t) {
	await e.callWS({
		type: `${N}/measurements/delete`,
		measurement_id: t
	});
}
// src/i18n/de.ts
var ut = {
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
	"chart.label": "Höhe und Breite im Verlauf",
	"nav.plan": "Gartenplan",
	"nav.plants": "Pflanzen",
	"plan.mode": "Modus",
	"plan.mode_view": "Ansicht",
	"plan.mode_edit": "Bearbeiten",
	"plan.tool_select": "Auswählen und verschieben",
	"plan.tool_rect": "Rechteck",
	"plan.tool_circle": "Kreis",
	"plan.tool_polygon": "Vieleck",
	"plan.new_kind": "Neue Flächen sind",
	"plan.snap": "Raster",
	"plan.snap_off": "Frei",
	"plan.undo": "Rückgängig",
	"plan.redo": "Wiederholen",
	"plan.fit": "Alles anzeigen",
	"plan.tray": "Pflanzen",
	"plan.tray_unplaced": "Noch nicht im Plan",
	"plan.tray_placed": "Im Plan",
	"plan.tray_hint": "Zieh eine Pflanze auf den Plan oder tippe sie an und danach auf ihren Standort.",
	"plan.tray_empty": "Noch keine Pflanzen.",
	"plan.new_plant": "Neue Pflanze",
	"plan.place_hint": "Tippe auf den Standort von {name}",
	"plan.polygon_hint": "Tippe, um Ecken zu setzen. Abschließen mit Doppeltippen, Enter oder Tippen auf die erste Ecke.",
	"plan.draw_hint": "Zum Zeichnen ziehen.",
	"plan.empty_hint": "Wechsle zu „Bearbeiten“, um deinen Garten zu zeichnen und Pflanzen zu platzieren.",
	"plan.cancel": "Abbrechen",
	"plan.details": "Details",
	"plan.show_on_plan": "Im Plan zeigen",
	"plan.unplace": "Aus dem Plan nehmen",
	"plan.crown": "Kronendurchmesser (m)",
	"plan.crown_auto": "automatisch: {size}",
	"plan.label": "Beschriftung",
	"plan.kind": "Art",
	"plan.linked_plant": "Pflanze auf dieser Fläche",
	"plan.no_plant": "Keine",
	"plan.locked": "Gesperrt (nicht verschiebbar)",
	"plan.area": "Fläche",
	"plan.delete_shape": "Fläche löschen",
	"plan.save_failed": "Speichern fehlgeschlagen: {message}",
	"plan.north": "Norden",
	"kind.bed": "Beet",
	"kind.raised_bed": "Hochbeet",
	"kind.lawn": "Rasen",
	"kind.hedge": "Hecke",
	"kind.terrace": "Terrasse",
	"kind.path": "Weg",
	"kind.house": "Gebäude",
	"kind.greenhouse": "Gewächshaus",
	"kind.roof": "Überdachung (kein Regen)",
	"kind.pond": "Teich",
	"kind.boundary": "Grundstücksgrenze",
	"kind.other": "Sonstiges"
}, dt = {
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
	"chart.label": "Height and width over time",
	"nav.plan": "Garden plan",
	"nav.plants": "Plants",
	"plan.mode": "Mode",
	"plan.mode_view": "View",
	"plan.mode_edit": "Edit",
	"plan.tool_select": "Select and move",
	"plan.tool_rect": "Rectangle",
	"plan.tool_circle": "Circle",
	"plan.tool_polygon": "Polygon",
	"plan.new_kind": "New areas are",
	"plan.snap": "Grid",
	"plan.snap_off": "Free",
	"plan.undo": "Undo",
	"plan.redo": "Redo",
	"plan.fit": "Show everything",
	"plan.tray": "Plants",
	"plan.tray_unplaced": "Not on the plan yet",
	"plan.tray_placed": "On the plan",
	"plan.tray_hint": "Drag a plant onto the plan, or tap it and then tap its spot.",
	"plan.tray_empty": "No plants yet.",
	"plan.new_plant": "New plant",
	"plan.place_hint": "Tap where {name} grows",
	"plan.polygon_hint": "Tap to add corners. Finish with a double tap, Enter or by tapping the first corner.",
	"plan.draw_hint": "Drag to draw.",
	"plan.empty_hint": "Switch to Edit to draw your garden and place plants.",
	"plan.cancel": "Cancel",
	"plan.details": "Details",
	"plan.show_on_plan": "Show on plan",
	"plan.unplace": "Remove from plan",
	"plan.crown": "Crown diameter (m)",
	"plan.crown_auto": "automatic: {size}",
	"plan.label": "Label",
	"plan.kind": "Type",
	"plan.linked_plant": "Plant on this area",
	"plan.no_plant": "None",
	"plan.locked": "Locked (cannot be moved)",
	"plan.area": "Area",
	"plan.delete_shape": "Delete area",
	"plan.save_failed": "Could not save: {message}",
	"plan.north": "North",
	"kind.bed": "Bed",
	"kind.raised_bed": "Raised bed",
	"kind.lawn": "Lawn",
	"kind.hedge": "Hedge",
	"kind.terrace": "Terrace",
	"kind.path": "Path",
	"kind.house": "Building",
	"kind.greenhouse": "Greenhouse",
	"kind.roof": "Roof (no rain)",
	"kind.pond": "Pond",
	"kind.boundary": "Property boundary",
	"kind.other": "Other"
}, ft = {
	de: ut,
	en: dt
};
function pt(e) {
	return ft[(e ?? "en").toLowerCase().split("-")[0] ?? "en"] ?? dt;
}
function mt(e) {
	let t = pt(e);
	return (e, n) => {
		let r = t[e] ?? dt[e] ?? e;
		return n ? r.replace(/\{(\w+)\}/g, (e, t) => t in n ? String(n[t]) : e) : r;
	};
}
// src/components/base.ts
var F = class extends M {
	static {
		this.properties = { hass: { attribute: !1 } };
	}
	get language() {
		return this.hass?.locale?.language ?? this.hass?.language ?? "en";
	}
	get t() {
		let e = this.language;
		return this._localize && e === this._language || (this._language = e, this._localize = mt(e)), this._localize;
	}
	fire(e, t) {
		this.dispatchEvent(new CustomEvent(e, {
			detail: t,
			bubbles: !0,
			composed: !0
		}));
	}
}, I = (e, t) => t ? w`<svg class="icon" viewBox="0 0 24 24" role="img" aria-label=${t}>
        <path d=${e}></path>
      </svg>` : w`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d=${e}></path></svg>`;
function L(e, t) {
	customElements.get(e) || customElements.define(e, t);
}
// src/state/garden-store.ts
var ht = 36e5, gt = 150, _t = class extends EventTarget {
	constructor(e) {
		super(), this._hass = e, this.plants = [], this.layout = null, this.loaded = !1, this.lastRefresh = 0;
	}
	async connect() {
		if (!this._unsubscribe) {
			try {
				this._unsubscribe = await rt(this._hass(), (e) => this._onChange(e));
			} catch (e) {
				this.error = P(e), this._emit("change");
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
		return Date.now() - this.lastRefresh > ht;
	}
	getPlant(e) {
		return this.plants.find((t) => t.id === e);
	}
	getShape(e) {
		return this.layout?.shapes.find((t) => t.id === e);
	}
	refresh() {
		return this._pending ??= this._load().finally(() => {
			this._pending = void 0;
		}), this._pending;
	}
	patchPlant(e, t) {
		this.plants = this.plants.map((n) => n.id === e ? {
			...n,
			...t
		} : n), this._emit("change");
	}
	putShape(e) {
		if (!this.layout) return;
		let t = this.layout.shapes.some((t) => t.id === e.id) ? this.layout.shapes.map((t) => t.id === e.id ? e : t) : [...this.layout.shapes, e];
		this.layout = {
			...this.layout,
			shapes: t.sort((e, t) => e.z - t.z)
		}, this._emit("change");
	}
	removeShape(e) {
		this.layout && (this.layout = {
			...this.layout,
			shapes: this.layout.shapes.filter((t) => t.id !== e)
		}, this._emit("change"));
	}
	async _load() {
		try {
			let [e, t] = await Promise.all([qe(this._hass()), et(this._hass())]);
			this.plants = e, this.layout = t, this.error = void 0, this.loaded = !0, this.lastRefresh = Date.now();
		} catch (e) {
			this.error = P(e);
		}
		this._emit("change");
	}
	_onChange(e) {
		this.dispatchEvent(new CustomEvent("plant-changed", { detail: e })), clearTimeout(this._refreshTimer), this._refreshTimer = setTimeout(() => void this.refresh(), gt);
	}
	_emit(e) {
		this.dispatchEvent(new Event(e));
	}
}, R = h`
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
`, vt = h`
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
function z(e, t = {}) {
	t.replace ? history.replaceState(history.state, "", e) : history.pushState(null, "", e), window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: !!t.replace } }));
}
// src/api/types.ts
var yt = [
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
], bt = [
	"bed",
	"raised_bed",
	"pot",
	"lawn",
	"greenhouse",
	"covered"
], xt = [
	"full_sun",
	"partial_shade",
	"shade"
], St = [
	"very_low",
	"low",
	"moderate",
	"high"
], Ct = [
	"sand",
	"loamy_sand",
	"sandy_loam",
	"loam",
	"silt_loam",
	"clay_loam",
	"clay",
	"potting_mix"
], wt = [
	"healthy",
	"watch",
	"problem",
	"dead",
	"removed"
], Tt = [
	"bed",
	"raised_bed",
	"lawn",
	"hedge",
	"terrace",
	"path",
	"house",
	"greenhouse",
	"roof",
	"pond",
	"boundary",
	"other"
], Et = {
	ATTRIBUTE: 1,
	CHILD: 2,
	PROPERTY: 3,
	BOOLEAN_ATTRIBUTE: 4,
	EVENT: 5,
	ELEMENT: 6
}, Dt = (e) => (...t) => ({
	_$litDirective$: e,
	values: t
}), Ot = class {
	constructor(e) {}
	get _$AU() {
		return this._$AM._$AU;
	}
	_$AT(e, t, n) {
		this._$Ct = e, this._$AM = t, this._$Ci = n;
	}
	_$AS(e, t) {
		return this.update(e, t);
	}
	update(e, t) {
		return this.render(...t);
	}
}, { I: kt } = Be, At = (e) => e, jt = () => document.createComment(""), B = (e, t, n) => {
	let r = e._$AA.parentNode, i = t === void 0 ? e._$AB : t._$AA;
	if (n === void 0) n = new kt(r.insertBefore(jt(), i), r.insertBefore(jt(), i), e, e.options);
	else {
		let t = n._$AB.nextSibling, a = n._$AM, o = a !== e;
		if (o) {
			let t;
			n._$AQ?.(e), n._$AM = e, n._$AP !== void 0 && (t = e._$AU) !== a._$AU && n._$AP(t);
		}
		if (t !== i || o) {
			let e = n._$AA;
			for (; e !== t;) {
				let t = At(e).nextSibling;
				At(r).insertBefore(e, i), e = t;
			}
		}
	}
	return n;
}, V = (e, t, n = e) => (e._$AI(t, n), e), Mt = {}, Nt = (e, t = Mt) => e._$AH = t, Pt = (e) => e._$AH, Ft = (e) => {
	e._$AR(), e._$AA.remove();
}, It = (e, t, n) => {
	let r = /* @__PURE__ */ new Map();
	for (let i = t; i <= n; i++) r.set(e[i], i);
	return r;
}, Lt = Dt(class extends Ot {
	constructor(e) {
		if (super(e), e.type !== Et.CHILD) throw Error("repeat() can only be used in text expressions");
	}
	dt(e, t, n) {
		let r;
		n === void 0 ? n = t : t !== void 0 && (r = t);
		let i = [], a = [], o = 0;
		for (let t of e) i[o] = r ? r(t, o) : o, a[o] = n(t, o), o++;
		return {
			values: a,
			keys: i
		};
	}
	render(e, t, n) {
		return this.dt(e, t, n).values;
	}
	update(e, [t, n, r]) {
		let i = Pt(e), { values: a, keys: o } = this.dt(t, n, r);
		if (!Array.isArray(i)) return this.ut = o, a;
		let s = this.ut ??= [], c = [], l, u, d = 0, f = i.length - 1, p = 0, m = a.length - 1;
		for (; d <= f && p <= m;) if (i[d] === null) d++;
		else if (i[f] === null) f--;
		else if (s[d] === o[p]) c[p] = V(i[d], a[p]), d++, p++;
		else if (s[f] === o[m]) c[m] = V(i[f], a[m]), f--, m--;
		else if (s[d] === o[m]) c[m] = V(i[d], a[m]), B(e, c[m + 1], i[d]), d++, m--;
		else if (s[f] === o[p]) c[p] = V(i[f], a[p]), B(e, i[d], i[f]), f--, p++;
		else if (l === void 0 && (l = It(o, p, m), u = It(s, d, f)), l.has(s[d])) {
			if (l.has(s[f])) {
				let t = u.get(o[p]), n = t === void 0 ? null : i[t];
				if (n === null) {
					let t = B(e, i[d]);
					V(t, a[p]), c[p] = t;
				} else c[p] = V(n, a[p]), B(e, i[d], n), i[t] = null;
				p++;
			} else Ft(i[f]), f--;
		} else Ft(i[d]), d++;
		for (; p <= m;) {
			let t = B(e, c[m + 1]);
			V(t, a[p]), c[p++] = t;
		}
		for (; d <= f;) {
			let e = i[d++];
			e !== null && Ft(e);
		}
		return this.ut = o, Nt(e, c), E;
	}
}), Rt = Math.PI / 180;
function zt(e, t) {
	let n = t * Rt, r = Math.cos(n), i = Math.sin(n);
	return {
		x: e.x * r - e.y * i,
		y: e.x * i + e.y * r
	};
}
function Bt(e, t) {
	return Math.hypot(e.x - t.x, e.y - t.y);
}
function Vt(e) {
	let t = e.w / 2, n = e.h / 2;
	return [
		{
			x: -t,
			y: -n
		},
		{
			x: t,
			y: -n
		},
		{
			x: t,
			y: n
		},
		{
			x: -t,
			y: n
		}
	].map((t) => {
		let n = zt(t, e.rotation);
		return {
			x: e.cx + n.x,
			y: e.cy + n.y
		};
	});
}
function Ht(e, t) {
	return zt({
		x: t.x - e.cx,
		y: t.y - e.cy
	}, -e.rotation);
}
function Ut(e, t) {
	let n = zt(t, e.rotation);
	return {
		x: e.cx + n.x,
		y: e.cy + n.y
	};
}
function Wt(e) {
	return e.points.map(([e, t]) => ({
		x: e,
		y: t
	}));
}
function Gt(e) {
	return e.type === "rect" ? Vt(e) : e.type === "polygon" ? Wt(e) : [];
}
function Kt(e) {
	return e.type === "circle" ? {
		minX: e.cx - e.r,
		minY: e.cy - e.r,
		maxX: e.cx + e.r,
		maxY: e.cy + e.r
	} : qt(Gt(e));
}
function qt(e) {
	return {
		minX: Math.min(...e.map((e) => e.x)),
		minY: Math.min(...e.map((e) => e.y)),
		maxX: Math.max(...e.map((e) => e.x)),
		maxY: Math.max(...e.map((e) => e.y))
	};
}
function Jt(e) {
	return e.length ? {
		minX: Math.min(...e.map((e) => e.minX)),
		minY: Math.min(...e.map((e) => e.minY)),
		maxX: Math.max(...e.map((e) => e.maxX)),
		maxY: Math.max(...e.map((e) => e.maxY))
	} : null;
}
function Yt(e) {
	if (e.type === "circle") return Math.PI * e.r * e.r;
	if (e.type === "rect") return e.w * e.h;
	let t = 0, n = e.points;
	for (let e = 0; e < n.length; e++) {
		let [r, i] = n[e] ?? [0, 0], [a, o] = n[(e + 1) % n.length] ?? [0, 0];
		t += r * o - a * i;
	}
	return Math.abs(t) / 2;
}
function Xt(e) {
	if (e.type !== "polygon") return {
		x: e.cx,
		y: e.cy
	};
	let t = e.points.length || 1;
	return {
		x: e.points.reduce((e, [t]) => e + t, 0) / t,
		y: e.points.reduce((e, [, t]) => e + t, 0) / t
	};
}
function Zt(e, t, n) {
	return e.type === "polygon" ? {
		...e,
		points: e.points.map(([e, r]) => [e + t, r + n])
	} : {
		...e,
		cx: e.cx + t,
		cy: e.cy + n
	};
}
function H(e, t) {
	return t > 0 ? Math.round(e / t) * t : e;
}
function Qt(e, t) {
	return {
		x: H(e.x, t),
		y: H(e.y, t)
	};
}
var $t = {
	nw: [-1, -1],
	ne: [1, -1],
	se: [1, 1],
	sw: [-1, 1]
}, en = .1;
function tn(e, t, n) {
	let [r, i] = $t[t], a = {
		x: -r * e.w / 2,
		y: -i * e.h / 2
	}, o = Ht(e, n), s = r > 0 ? Math.max(o.x, a.x + en) : Math.min(o.x, a.x - en), c = i > 0 ? Math.max(o.y, a.y + en) : Math.min(o.y, a.y - en), l = Ut(e, {
		x: (a.x + s) / 2,
		y: (a.y + c) / 2
	});
	return {
		...e,
		cx: l.x,
		cy: l.y,
		w: Math.abs(s - a.x),
		h: Math.abs(c - a.y)
	};
}
function nn(e, t, n = 0) {
	let r = ((Math.atan2(t.y - e.cy, t.x - e.cx) / Rt + 90) % 360 + 540) % 360 - 180;
	return n > 0 ? Math.round(r / n) * n : r;
}
function rn(e, t) {
	return {
		type: "rect",
		cx: (e.x + t.x) / 2,
		cy: (e.y + t.y) / 2,
		w: Math.abs(t.x - e.x),
		h: Math.abs(t.y - e.y),
		rotation: 0
	};
}
function an(e, t, n) {
	return {
		...e,
		points: e.points.map((e, r) => r === t ? [n.x, n.y] : e)
	};
}
function on(e, t, n) {
	let r = [...e.points];
	return r.splice(t + 1, 0, [n.x, n.y]), {
		...e,
		points: r
	};
}
function sn(e, t) {
	return e.points.length <= 3 ? e : {
		...e,
		points: e.points.filter((e, n) => n !== t)
	};
}
var cn = {
	tree: 4,
	shrub: 1.2,
	hedge: 1,
	fruit: 1.5,
	climber: .6,
	perennial: .5,
	grass: .6,
	lawn: 1,
	potted: .6,
	vegetable: .4,
	herb: .3,
	annual: .3,
	succulent: .3,
	bulb: .2,
	other: .5
};
function U(e) {
	return e.crown_diameter_m ? e.crown_diameter_m : e.width_cm ? e.width_cm / 100 : cn[e.category] ?? .5;
}
// src/util/format.ts
function ln(e) {
	let [t, n, r] = e.split("-").map(Number);
	return new Date(t ?? 1970, (n ?? 1) - 1, r ?? 1);
}
function W(e = /* @__PURE__ */ new Date()) {
	let t = (e) => String(e).padStart(2, "0");
	return `${e.getFullYear()}-${t(e.getMonth() + 1)}-${t(e.getDate())}`;
}
function G(e, t) {
	if (!e) return "";
	let n = e.length === 10 ? ln(e) : new Date(e);
	return new Intl.DateTimeFormat(t, { dateStyle: "medium" }).format(n);
}
function un(e, t) {
	return new Intl.DateTimeFormat(t, {
		month: "long",
		year: "numeric"
	}).format(new Date(e));
}
function dn(e) {
	let t = new Date(e);
	return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
}
function K(e, t, n = 1) {
	return new Intl.NumberFormat(t, { maximumFractionDigits: n }).format(e);
}
function q(e, t) {
	return e == null ? "" : e >= 100 ? `${K(e / 100, t, 2)} m` : `${K(e, t)} cm`;
}
function fn(e, t) {
	if (e == null) return "";
	if (e < 1) return t("age.under_month");
	let n = Math.floor(e / 12), r = e % 12, i = [];
	return n && i.push(t(n === 1 ? "age.year_one" : "age.year_other", { n })), r && i.push(t(r === 1 ? "age.month_one" : "age.month_other", { n: r })), i.join(", ");
}
var pn = 5e3, mn = {
	cx: 0,
	cy: 0,
	width: 40
}, hn = (e) => Math.min(pn, Math.max(1, e));
function J(e, t) {
	return e.width / Math.max(1, t.width);
}
function gn(e, t) {
	let n = e.width * (Math.max(1, t.height) / Math.max(1, t.width));
	return {
		x: e.cx - e.width / 2,
		y: e.cy - n / 2,
		w: e.width,
		h: n
	};
}
function _n(e, t, n, r) {
	let i = gn(e, t), a = J(e, t);
	return {
		x: i.x + (n - t.left) * a,
		y: i.y + (r - t.top) * a
	};
}
function vn(e, t, n) {
	let r = gn(e, t), i = J(e, t);
	return {
		x: t.left + (n.x - r.x) / i,
		y: t.top + (n.y - r.y) / i
	};
}
function yn(e, t, n, r, i) {
	let a = _n(e, t, n, r), o = hn(e.width / i), s = o / e.width;
	return {
		width: o,
		cx: a.x + (e.cx - a.x) * s,
		cy: a.y + (e.cy - a.y) * s
	};
}
function bn(e, t, n, r) {
	let i = J(e, t);
	return {
		...e,
		cx: e.cx - n * i,
		cy: e.cy - r * i
	};
}
function xn(e, t, n = .12) {
	if (!e) return mn;
	let r = Math.max(e.maxX - e.minX, 2), i = Math.max(e.maxY - e.minY, 2), a = Math.max(1, t.width) / Math.max(1, t.height), o = hn(Math.max(r, i * a) * (1 + 2 * n));
	return {
		cx: (e.minX + e.maxX) / 2,
		cy: (e.minY + e.maxY) / 2,
		width: o
	};
}
var Sn = [
	.1,
	.25,
	.5,
	1,
	2,
	5,
	10,
	25,
	50,
	100,
	250,
	500
];
function Cn(e, t = 14) {
	return Sn.find((n) => n / e >= t) ?? Sn[Sn.length - 1] ?? 500;
}
function wn(e, t = 120) {
	let n = [
		...Sn,
		1e3,
		2e3
	].filter((n) => n / e <= t), r = n[n.length - 1] ?? .1;
	return {
		metres: r,
		px: r / e
	};
}
function Tn(e) {
	let t = e;
	return typeof t == "object" && !!t && [
		t.cx,
		t.cy,
		t.width
	].every((e) => typeof e == "number" && Number.isFinite(e)) && t.width >= 1 && t.width <= 5e3;
}
// src/components/garden-canvas.ts
var En = {
	mouse: 4,
	pen: 6,
	touch: 10
}, Dn = 9, On = .06, kn = 28, An = 15, jn = 14;
function Mn(e) {
	let [t, n] = e.split(":");
	switch (t) {
		case "corner": return {
			kind: t,
			corner: n
		};
		case "vertex":
		case "midpoint": return {
			kind: t,
			index: Number(n)
		};
		case "rotate":
		case "radius":
		case "crown": return { kind: t };
		default: return null;
	}
}
L("pg-garden-canvas", class extends F {
	static {
		this.properties = {
			plants: { attribute: !1 },
			shapes: { attribute: !1 },
			mode: { reflect: !0 },
			tool: {},
			selection: { attribute: !1 },
			snapStep: { attribute: !1 },
			armedPlantId: { attribute: !1 },
			_override: { state: !0 },
			_draft: { state: !0 },
			_polygon: { state: !0 },
			_cursor: { state: !0 },
			_settledMpp: { state: !0 }
		};
	}
	constructor() {
		super(), this._vp = { ...mn }, this._hasViewport = !1, this._gesture = null, this._pointers = /* @__PURE__ */ new Map(), this._hoverId = null, this._onKeyDown = (e) => {
			e.key === "Escape" ? this._polygon || this._draft ? this.cancelDrawing() : this.fire("cancel") : this._polygon ? e.key === "Enter" ? (e.preventDefault(), this.finishPolygon()) : e.key === "Backspace" && (e.preventDefault(), this._polygon = this._polygon.length > 1 ? this._polygon.slice(0, -1) : null) : (e.key === "Delete" || e.key === "Backspace") && this.mode === "edit" && this.selection && (e.preventDefault(), this.fire("delete-selection", { selection: this.selection }));
		}, this.plants = [], this.shapes = [], this.mode = "view", this.tool = "select", this.selection = null, this.snapStep = .5, this.armedPlantId = null, this._override = null, this._draft = null, this._polygon = null, this._cursor = null, this._settledMpp = .05;
	}
	get viewport() {
		return { ...this._vp };
	}
	get hasViewport() {
		return this._hasViewport;
	}
	set viewport(e) {
		this._vp = { ...e }, this._hasViewport = !0, this._applyViewport();
	}
	fit(e = this.contentBounds()) {
		this.viewport = xn(e, this._rect()), this._emitViewport();
	}
	centerOn(e, t = Math.min(this._vp.width, 12)) {
		this.viewport = {
			cx: e.x,
			cy: e.y,
			width: t
		}, this._emitViewport();
	}
	contentBounds() {
		let e = this.shapes.map((e) => Kt(e.geometry));
		for (let t of this.plants) {
			if (!t.position) continue;
			let n = U(t) / 2;
			e.push({
				minX: t.position.x - n,
				minY: t.position.y - n,
				maxX: t.position.x + n,
				maxY: t.position.y + n
			});
		}
		return Jt(e);
	}
	planPoint(e, t) {
		return _n(this._vp, this._rect(), e, t);
	}
	screenPoint(e) {
		return vn(this._vp, this._rect(), e);
	}
	finishPolygon() {
		let e = Math.max(this._mpp() * 4, 1e-6), t = (this._polygon ?? []).filter((t, n, r) => n === 0 || Bt(t, r[n - 1] ?? t) > e);
		if (this._polygon = null, this._cursor = null, t.length >= 3) {
			let e = {
				type: "polygon",
				points: t.map((e) => [e.x, e.y])
			};
			this.fire("create-shape", { geometry: e });
		}
	}
	cancelDrawing() {
		this._polygon = null, this._cursor = null, this._draft = null;
	}
	connectedCallback() {
		super.connectedCallback(), this.hasAttribute("tabindex") || (this.tabIndex = 0), this.addEventListener("keydown", this._onKeyDown), typeof ResizeObserver < "u" && (this._resizeObserver = new ResizeObserver(() => this._applyViewport()), this._resizeObserver.observe(this));
	}
	disconnectedCallback() {
		super.disconnectedCallback(), this.removeEventListener("keydown", this._onKeyDown), this._resizeObserver?.disconnect(), clearTimeout(this._settleTimer), clearTimeout(this._viewportTimer);
	}
	firstUpdated() {
		this._applyViewport();
	}
	updated(e) {
		(e.has("mode") || e.has("tool")) && (this.mode !== "edit" || this.tool !== "polygon") && this.cancelDrawing();
	}
	get _svg() {
		return this.renderRoot.querySelector("svg");
	}
	_rect() {
		let e = this._svg?.getBoundingClientRect() ?? this.getBoundingClientRect();
		return e.width > 0 ? e : {
			left: e.left,
			top: e.top,
			width: 800,
			height: 600
		};
	}
	_mpp() {
		return J(this._vp, this._rect());
	}
	_fmt(e) {
		return K(e, this.language, 1);
	}
	_applyViewport() {
		let e = this._svg;
		if (!e) return;
		let t = this._rect(), n = gn(this._vp, t);
		e.setAttribute("viewBox", `${n.x} ${n.y} ${n.w} ${n.h}`);
		let r = J(this._vp, t);
		e.style.setProperty("--mpp", String(r)), e.toggleAttribute("data-labels", r <= On), this._drawGrid(n, r), this._drawScale(r), this.dispatchEvent(new Event("view-moved")), clearTimeout(this._settleTimer), this._settleTimer = setTimeout(() => {
			Math.abs(this._settledMpp - r) / r > .05 && (this._settledMpp = r);
		}, 120);
	}
	_drawGrid(e, t) {
		let n = this.renderRoot.querySelector(".grid-minor"), r = this.renderRoot.querySelector(".grid-major");
		if (!n || !r) return;
		let i = Cn(t), a = Cn(t, 70), o = (t) => {
			let n = [], r = Math.floor(e.x / t) * t, i = Math.floor(e.y / t) * t;
			for (let i = r; i <= e.x + e.w; i += t) n.push(`M${i.toFixed(3)} ${e.y}V${e.y + e.h}`);
			for (let r = i; r <= e.y + e.h; r += t) n.push(`M${e.x} ${r.toFixed(3)}H${e.x + e.w}`);
			return n.join("");
		};
		n.setAttribute("d", i === a ? "" : o(i)), r.setAttribute("d", o(a));
	}
	_drawScale(e) {
		let t = this.renderRoot.querySelector(".scale-bar"), n = this.renderRoot.querySelector(".scale-label");
		if (!t || !n) return;
		let { metres: r, px: i } = wn(e);
		t.style.width = `${i}px`, n.textContent = r >= 1e3 ? `${this._fmt(r / 1e3)} km` : r >= 1 ? `${this._fmt(r)} m` : `${Math.round(r * 100)} cm`;
	}
	_setViewport(e) {
		this._vp = e, this._hasViewport = !0, this._applyViewport(), clearTimeout(this._viewportTimer), this._viewportTimer = setTimeout(() => this._emitViewport(), 300);
	}
	_emitViewport() {
		this.fire("viewport-change", { viewport: this.viewport });
	}
	_hit(e) {
		let t = e.composedPath()[0], n = t?.closest?.("[data-handle]")?.getAttribute("data-handle");
		if (n) {
			let e = Mn(n);
			if (e) return {
				type: "handle",
				handle: e
			};
		}
		let r = t?.closest?.("[data-plant-id]")?.getAttribute("data-plant-id");
		if (r) return {
			type: "plant",
			id: r
		};
		let i = t?.closest?.("[data-shape-id]")?.getAttribute("data-shape-id");
		return i ? {
			type: "shape",
			id: i
		} : { type: "empty" };
	}
	_point(e, t = !0) {
		let n = _n(this._vp, this._rect(), e.clientX, e.clientY);
		return t && !e.altKey ? Qt(n, this.snapStep) : n;
	}
	_plant(e) {
		return this.plants.find((t) => t.id === e);
	}
	_shape(e) {
		return this.shapes.find((t) => t.id === e);
	}
	_capture(e, t) {
		try {
			t ? this._svg?.setPointerCapture?.(e) : this._svg?.releasePointerCapture?.(e);
		} catch {}
	}
	_onPointerDown(e) {
		if (e.button === 0 || e.pointerType !== "mouse") {
			if (this.focus({ preventScroll: !0 }), this._capture(e.pointerId, !0), this._pointers.set(e.pointerId, {
				x: e.clientX,
				y: e.clientY
			}), this._setHover(null, e), this._pointers.size === 2) this._startPinch();
			else if (!(this._pointers.size > 2)) {
				if (this.mode === "edit" && (this.tool === "rect" || this.tool === "circle") && !this.armedPlantId) {
					let t = this._point(e);
					this._gesture = {
						kind: "draw",
						tool: this.tool,
						anchor: t
					}, this._draft = this._draftGeometry(this.tool, t, t);
				} else this._gesture = {
					kind: "pending",
					startX: e.clientX,
					startY: e.clientY,
					hit: this._hit(e),
					pointerType: e.pointerType
				};
			}
		}
	}
	_onPointerMove(e) {
		this._pointers.has(e.pointerId) && this._pointers.set(e.pointerId, {
			x: e.clientX,
			y: e.clientY
		});
		let t = this._gesture;
		if (!t) this._trackHover(e);
		else switch (t.kind) {
			case "pending": {
				let n = En[t.pointerType] ?? 6;
				if (Math.hypot(e.clientX - t.startX, e.clientY - t.startY) < n) return;
				this._startDrag(t, e), this._onPointerMove(e);
				return;
			}
			case "pan":
				this._setViewport(bn(this._vp, this._rect(), e.clientX - t.lastX, e.clientY - t.lastY)), t.lastX = e.clientX, t.lastY = e.clientY;
				return;
			case "pinch":
				this._movePinch();
				return;
			case "move-plant": {
				let n = this._point(e, !1), r = {
					x: n.x - t.offset.x,
					y: n.y - t.offset.y
				};
				this._override = {
					plantId: t.plantId,
					position: e.altKey ? r : Qt(r, this.snapStep)
				};
				return;
			}
			case "move-shape": {
				let n = this._point(e, !1), r = n.x - t.start.x, i = n.y - t.start.y, a = e.altKey ? 0 : this.snapStep;
				this._override = {
					shapeId: t.shapeId,
					geometry: Zt(t.from, H(r, a), H(i, a))
				};
				return;
			}
			case "shape-handle":
				this._override = {
					shapeId: t.shapeId,
					geometry: this._applyHandle(t.from, t.handle, e)
				};
				return;
			case "crown": {
				let n = this._point(e, !1), r = e.altKey ? 0 : Math.max(.05, this.snapStep / 2), i = Math.max(.05, H(Bt(t.centre, n) * 2, r));
				this._override = {
					plantId: t.plantId,
					crown: i
				};
				return;
			}
			case "draw":
				this._draft = this._draftGeometry(t.tool, t.anchor, this._point(e)), this._cursor = this._point(e);
				return;
		}
	}
	_onPointerUp(e) {
		this._pointers.delete(e.pointerId), this._capture(e.pointerId, !1);
		let t = this._gesture;
		if (t?.kind === "pinch") {
			let e = [...this._pointers.values()][0];
			this._gesture = e ? {
				kind: "pan",
				lastX: e.x,
				lastY: e.y
			} : null;
		} else if (this._gesture = null, t) {
			if (e.type === "pointercancel") this._override = null, this._draft = null;
			else switch (t.kind) {
				case "pending":
					this._tap(t.hit, e);
					return;
				case "move-plant": {
					let e = this._override?.position;
					this._override = null, e && (e.x !== t.from.x || e.y !== t.from.y) && this.fire("move-plant", {
						plantId: t.plantId,
						from: t.from,
						to: e
					});
					return;
				}
				case "move-shape":
				case "shape-handle": {
					let e = this._override?.geometry;
					this._override = null, e && JSON.stringify(e) !== JSON.stringify(t.from) && this.fire("change-shape", {
						shapeId: t.shapeId,
						from: t.from,
						to: e
					});
					return;
				}
				case "crown": {
					let e = this._override?.crown;
					this._override = null;
					let n = this._plant(t.plantId);
					e && n && e !== t.from && this.fire("resize-crown", {
						plantId: t.plantId,
						from: n.crown_diameter_m,
						to: e
					});
					return;
				}
				case "draw": {
					let e = this._draft;
					this._draft = null, this._cursor = null, e && this._bigEnough(e) && this.fire("create-shape", { geometry: e });
					return;
				}
				default: return;
			}
		}
	}
	_onDoubleClick(e) {
		if (this._polygon) {
			e.preventDefault(), this.finishPolygon();
			return;
		}
		if (this.mode !== "edit") return;
		let t = this._hit(e);
		if (t.type === "handle" && t.handle.kind === "vertex" && this.selection?.type === "shape") {
			let e = this._shape(this.selection.id);
			if (e?.geometry.type === "polygon" && e.geometry.points.length > 3) {
				let n = sn(e.geometry, t.handle.index);
				this.fire("change-shape", {
					shapeId: e.id,
					from: e.geometry,
					to: n
				});
			}
		}
	}
	_onWheel(e) {
		e.preventDefault();
		let t = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, n = Math.exp(-t * (e.ctrlKey ? .01 : .0015));
		this._setViewport(yn(this._vp, this._rect(), e.clientX, e.clientY, n));
	}
	_onPointerLeave(e) {
		this._gesture || this._setHover(null, e), this._polygon && (this._cursor = null);
	}
	_startPinch() {
		let [e, t] = [...this._pointers.values()];
		e && t && (this._override = null, this._draft = null, this._gesture = {
			kind: "pinch",
			distance: Math.hypot(e.x - t.x, e.y - t.y),
			midX: (e.x + t.x) / 2,
			midY: (e.y + t.y) / 2,
			viewport: { ...this._vp }
		});
	}
	_movePinch() {
		let e = this._gesture, [t, n] = [...this._pointers.values()];
		if (e?.kind !== "pinch" || !t || !n) return;
		let r = this._rect(), i = Math.hypot(t.x - n.x, t.y - n.y) / Math.max(1, e.distance), a = yn(e.viewport, r, e.midX, e.midY, i), o = (t.x + n.x) / 2, s = (t.y + n.y) / 2;
		this._setViewport(bn(a, r, o - e.midX, s - e.midY));
	}
	_startDrag(e, t) {
		let { hit: n } = e, r = this.mode === "edit" && !this.armedPlantId, i = _n(this._vp, this._rect(), e.startX, e.startY);
		if (r && n.type === "handle") {
			let e = this.selection;
			if (e?.type === "plant" && n.handle.kind === "crown") {
				let t = this._plant(e.id);
				if (t?.position) {
					this._gesture = {
						kind: "crown",
						plantId: t.id,
						from: U(t),
						centre: t.position
					};
					return;
				}
			}
			if (e?.type === "shape") {
				let t = this._shape(e.id);
				if (t && !t.locked) {
					let e = t.geometry, r = n.handle;
					r.kind === "midpoint" && e.type === "polygon" && (e = on(e, r.index, i), r = {
						kind: "vertex",
						index: r.index + 1
					}), this._gesture = {
						kind: "shape-handle",
						shapeId: t.id,
						handle: r,
						from: e
					}, e !== t.geometry && (this._override = {
						shapeId: t.id,
						geometry: e
					});
					return;
				}
			}
		}
		if (r && n.type === "plant") {
			let e = this._plant(n.id);
			if (e?.position) {
				this.fire("select", { selection: {
					type: "plant",
					id: e.id
				} }), this._gesture = {
					kind: "move-plant",
					plantId: e.id,
					from: e.position,
					offset: {
						x: i.x - e.position.x,
						y: i.y - e.position.y
					}
				};
				return;
			}
		}
		if (r && n.type === "shape" && this.tool === "select") {
			let e = this._shape(n.id);
			if (e && !e.locked) {
				this.fire("select", { selection: {
					type: "shape",
					id: e.id
				} }), this._gesture = {
					kind: "move-shape",
					shapeId: e.id,
					from: e.geometry,
					start: i
				};
				return;
			}
		}
		this._gesture = {
			kind: "pan",
			lastX: e.startX,
			lastY: e.startY
		};
	}
	_tap(e, t) {
		if (this.armedPlantId) this.fire("place", {
			plantId: this.armedPlantId,
			at: this._point(t)
		});
		else if (this.mode === "edit" && this.tool === "polygon") {
			let e = this._point(t), n = this._polygon ?? [], r = n[0];
			if (r && n.length >= 3) {
				let e = this.screenPoint(r);
				if (Math.hypot(e.x - t.clientX, e.y - t.clientY) < jn) {
					this.finishPolygon();
					return;
				}
			}
			this._polygon = [...n, e];
		} else e.type === "plant" || e.type === "shape" ? (this.fire("select", { selection: {
			type: e.type,
			id: e.id
		} }), e.type === "plant" && t.pointerType !== "mouse" && this.fire("hover", {
			plantId: e.id,
			x: t.clientX,
			y: t.clientY
		})) : e.type === "empty" && this.fire("select", { selection: null });
	}
	_trackHover(e) {
		if (this._polygon && (this._cursor = this._point(e)), e.pointerType !== "mouse") return;
		let t = this._hit(e);
		this._setHover(t.type === "plant" ? t.id : null, e);
	}
	_setHover(e, t) {
		e !== this._hoverId && (this._hoverId = e, this.fire("hover", {
			plantId: e,
			x: t.clientX,
			y: t.clientY
		}));
	}
	_applyHandle(e, t, n) {
		let r = this._point(n), i = this._point(n, !1);
		if (e.type === "rect") {
			if (t.kind === "corner") return tn(e, t.corner, r);
			if (t.kind === "rotate") return {
				...e,
				rotation: nn(e, i, n.altKey ? 0 : An)
			};
		}
		if (e.type === "circle" && t.kind === "radius") {
			let t = n.altKey ? 0 : Math.max(.05, this.snapStep / 2);
			return {
				...e,
				r: Math.max(.05, H(Bt({
					x: e.cx,
					y: e.cy
				}, i), t))
			};
		}
		return e.type === "polygon" && t.kind === "vertex" ? an(e, t.index, r) : e;
	}
	_draftGeometry(e, t, n) {
		return e === "rect" ? rn(t, n) : {
			type: "circle",
			cx: t.x,
			cy: t.y,
			r: Bt(t, n)
		};
	}
	_bigEnough(e) {
		return e.type === "rect" ? e.w >= .1 && e.h >= .1 : e.type !== "circle" || e.r >= .05;
	}
	_geometryOf(e) {
		let t = this._override;
		return t?.shapeId === e.id && t.geometry ? t.geometry : e.geometry;
	}
	_renderGeometry(e, t = "") {
		return e.type === "rect" ? T`<rect class=${t} x=${-e.w / 2} y=${-e.h / 2} width=${e.w} height=${e.h}
        transform="translate(${e.cx} ${e.cy}) rotate(${e.rotation})"></rect>` : e.type === "circle" ? T`<circle class=${t} cx=${e.cx} cy=${e.cy} r=${e.r}></circle>` : T`<polygon class=${t} points=${e.points.map(([e, t]) => `${e},${t}`).join(" ")}></polygon>`;
	}
	_renderShape(e) {
		let t = this._geometryOf(e), n = this.selection?.type === "shape" && this.selection.id === e.id, r = Xt(t);
		return T`<g class="shape kind-${e.kind} ${n ? "selected" : ""} ${e.locked ? "locked" : ""}"
        data-shape-id=${e.id}>
      ${this._renderGeometry(t, "body")}
      ${e.label ? T`<text class="shape-label" x=${r.x} y=${r.y}>${e.label}</text>` : D}
    </g>`;
	}
	_renderPlant(e, t) {
		let n = this._override, r = n?.plantId === e.id, i = r && n?.position || e.position;
		if (!i) return D;
		let a = r && n?.crown || U(e), o = Math.max(a / 2, Dn * t), c = this.selection?.type === "plant" && this.selection.id === e.id;
		return T`<g class="plant status-${e.status} ${c ? "selected" : ""}"
        data-plant-id=${e.id} transform="translate(${i.x} ${i.y})">
      <circle class="shadow" r=${o} cy=${o * .08}></circle>
      <circle class="crown" r=${o}></circle>
      ${e.cover ? T`<image href=${e.cover.urls.thumb} x=${-o} y=${-o} width=${2 * o} height=${2 * o}
            preserveAspectRatio="xMidYMid slice" clip-path="url(#pg-round)"></image>` : T`<path class="sprout" d=${s}
            transform="translate(${-o * .6} ${-o * .6}) scale(${o * 1.2 / 24})"></path>`}
      <circle class="ring" r=${o}></circle>
      <text class="plant-label" y=${o}>${e.name}</text>
    </g>`;
	}
	_handle(e, t, n = "") {
		let r = this._settledMpp;
		return T`<g class="handle-group ${n}" data-handle=${e} transform="translate(${t.x} ${t.y})">
      <circle class="handle-hit" r=${16 * r}></circle><circle class="handle" r=${6 * r}></circle>
    </g>`;
	}
	_renderSelection(e) {
		if (this.mode !== "edit" || !this.selection) return D;
		if (this.selection.type === "plant") {
			let t = this._plant(this.selection.id), n = this._override, r = n?.plantId === t?.id && n?.position || t?.position;
			if (!t || !r) return D;
			let i = n?.plantId === t.id && n?.crown || U(t), a = Math.max(i / 2, Dn * e);
			return T`
        ${this._handle("crown", {
				x: r.x + a,
				y: r.y
			})}
        ${n?.plantId === t.id && n.crown ? T`<text class="measure" x=${r.x} y=${r.y - a}>Ø ${this._fmt(i)} m</text>` : D}`;
		}
		let t = this._shape(this.selection.id);
		if (!t || t.locked) return D;
		let n = this._geometryOf(t);
		if (n.type === "rect") {
			let t = Vt(n), r = [
				"nw",
				"ne",
				"se",
				"sw"
			], i = Ut(n, {
				x: 0,
				y: -n.h / 2
			}), a = Ut(n, {
				x: 0,
				y: -n.h / 2 - kn * e
			});
			return T`
        <line class="rotate-arm" x1=${i.x} y1=${i.y} x2=${a.x} y2=${a.y}></line>
        ${t.map((e, t) => this._handle(`corner:${r[t]}`, e))}
        ${this._handle("rotate", a, "rotate")}
        ${this._renderMeasure(n)}`;
		}
		if (n.type === "circle") return T`${this._handle("radius", {
			x: n.cx + n.r,
			y: n.cy
		})}${this._renderMeasure(n)}`;
		let r = n.points;
		return T`
      ${r.map(([e, t], n) => {
			let [i, a] = r[(n + 1) % r.length] ?? [e, t];
			return this._handle(`midpoint:${n}`, {
				x: (e + i) / 2,
				y: (t + a) / 2
			}, "midpoint");
		})}
      ${r.map(([e, t], n) => this._handle(`vertex:${n}`, {
			x: e,
			y: t
		}))}
      ${this._renderMeasure(n)}`;
	}
	_renderMeasure(e) {
		if (!this._override?.geometry && !this._draft) return D;
		let t = Xt(e), n = e.type === "rect" ? `${this._fmt(e.w)} × ${this._fmt(e.h)} m` : e.type === "circle" ? `Ø ${this._fmt(e.r * 2)} m` : `${this._fmt(Yt(e))} m²`;
		return T`<text class="measure" x=${t.x} y=${t.y}>${n}</text>`;
	}
	_renderDraft() {
		if (this._draft) return T`<g class="draft">${this._renderGeometry(this._draft, "body")}${this._renderMeasure(this._draft)}</g>`;
		if (this._polygon?.length) {
			let e = this._cursor ? [...this._polygon, this._cursor] : this._polygon, [t] = this._polygon;
			return T`<g class="draft">
        <polyline class="body" points=${e.map((e) => `${e.x},${e.y}`).join(" ")}></polyline>
        ${t ? this._handle("close", t, "close") : D}
      </g>`;
		}
		return D;
	}
	render() {
		let e = this._settledMpp, t = this.plants.filter((e) => e.position).sort((e, t) => U(t) - U(e));
		return w`
      <svg
        class="mode-${this.mode} tool-${this.tool} ${this.armedPlantId ? "armed" : ""}"
        @pointerdown=${this._onPointerDown}
        @pointermove=${this._onPointerMove}
        @pointerup=${this._onPointerUp}
        @pointercancel=${this._onPointerUp}
        @pointerleave=${this._onPointerLeave}
        @dblclick=${this._onDoubleClick}
        @wheel=${this._onWheel}
        @contextmenu=${(e) => e.preventDefault()}
      >
        <defs>
          <clipPath id="pg-round" clipPathUnits="objectBoundingBox">
            <circle cx="0.5" cy="0.5" r="0.5"></circle>
          </clipPath>
          <pattern id="pg-lawn" patternUnits="userSpaceOnUse" width="0.6" height="0.6">
            <rect width="0.6" height="0.6" class="lawn-base"></rect>
            <path
              class="lawn-blade"
              d="M0.1 0.45l0.05 -0.15M0.4 0.2l0.04 -0.14M0.32 0.55l0.03 -0.12"
            ></path>
          </pattern>
          <pattern
            id="pg-roof"
            patternUnits="userSpaceOnUse"
            width="0.5"
            height="0.5"
            patternTransform="rotate(45)"
          >
            <rect width="0.5" height="0.5" class="roof-base"></rect>
            <line x1="0" y1="0" x2="0" y2="0.5" class="roof-line"></line>
          </pattern>
        </defs>
        <rect class="ground" x="-100000" y="-100000" width="200000" height="200000"></rect>
        <path class="grid-minor"></path>
        <path class="grid-major"></path>
        <g class="shapes">
          ${Lt(this.shapes, (e) => e.id, (e) => this._renderShape(e))}
        </g>
        <g class="plants">
          ${Lt(t, (e) => e.id, (t) => this._renderPlant(t, e))}
        </g>
        <g class="selection">${this._renderSelection(e)}</g>
        ${this._renderDraft()}
      </svg>
      <div class="overlay">
        <div class="north" aria-hidden="true">N</div>
        <div class="scale">
          <div class="scale-bar"></div>
          <span class="scale-label"></span>
        </div>
      </div>
    `;
	}
	static {
		this.styles = h`
    :host {
      position: relative;
      display: block;
      overflow: hidden;
      outline: none;
      --pg-ground: color-mix(in srgb, var(--pg-leaf-soft) 35%, var(--pg-surface));
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      cursor: grab;
      --mpp: 0.05;
    }
    svg.mode-edit.tool-rect,
    svg.mode-edit.tool-circle,
    svg.mode-edit.tool-polygon,
    svg.armed {
      cursor: crosshair;
    }
    .ground {
      fill: var(--pg-ground);
    }
    .grid-minor,
    .grid-major {
      fill: none;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
    .grid-minor {
      stroke: color-mix(in srgb, var(--pg-text) 6%, transparent);
      stroke-width: 1;
    }
    .grid-major {
      stroke: color-mix(in srgb, var(--pg-text) 13%, transparent);
      stroke-width: 1;
    }

    /* ---------------------------------------------- shapes */
    .shape .body {
      vector-effect: non-scaling-stroke;
      stroke-width: 1.5;
      stroke: color-mix(in srgb, var(--kind-fill) 60%, #000);
      fill: var(--kind-fill);
      stroke-linejoin: round;
    }
    .shape {
      cursor: pointer;
    }
    .mode-edit .shape:not(.locked) {
      cursor: move;
    }
    .kind-bed {
      --kind-fill: #a07a5a;
    }
    .kind-raised_bed {
      --kind-fill: #8f6b4c;
    }
    .kind-raised_bed .body {
      stroke: #c49a6c;
      stroke-width: 4;
    }
    .kind-lawn {
      --kind-fill: #9ccc78;
    }
    .kind-lawn .body {
      fill: url(#pg-lawn);
    }
    .lawn-base {
      fill: #9ccc78;
    }
    .lawn-blade {
      stroke: #86b964;
      stroke-width: 0.03;
      stroke-linecap: round;
    }
    .kind-hedge {
      --kind-fill: #4c7d4f;
    }
    .kind-terrace {
      --kind-fill: #dccbaa;
    }
    .kind-path {
      --kind-fill: #d4cec4;
    }
    .kind-house {
      --kind-fill: #9a9a9a;
    }
    .kind-greenhouse {
      --kind-fill: rgba(190, 225, 235, 0.7);
    }
    .kind-roof {
      --kind-fill: #b9b9b9;
    }
    .kind-roof .body {
      fill: url(#pg-roof);
    }
    .roof-base {
      fill: rgba(185, 185, 185, 0.55);
    }
    .roof-line {
      stroke: rgba(120, 120, 120, 0.6);
      stroke-width: 0.05;
    }
    .kind-pond {
      --kind-fill: #7cbfe3;
    }
    .kind-other {
      --kind-fill: #c8c8c8;
    }
    .kind-boundary .body {
      fill: none;
      stroke: color-mix(in srgb, var(--pg-text) 55%, transparent);
      stroke-width: 2;
      stroke-dasharray: 8 5;
    }
    .shape.selected .body {
      stroke: var(--pg-accent);
      stroke-width: 2.5;
    }
    .shape-label,
    .plant-label,
    .measure {
      font-size: calc(var(--mpp) * 12px);
      text-anchor: middle;
      dominant-baseline: middle;
      pointer-events: none;
      paint-order: stroke;
      stroke: var(--pg-surface);
      stroke-width: calc(var(--mpp) * 3px);
      fill: var(--pg-text);
    }
    .shape-label {
      font-weight: 500;
      fill: color-mix(in srgb, var(--pg-text) 85%, transparent);
    }
    .measure {
      font-size: calc(var(--mpp) * 13px);
      font-weight: 600;
      fill: var(--pg-accent);
    }

    /* ---------------------------------------------- plants */
    .plant {
      cursor: pointer;
    }
    .mode-edit .plant {
      cursor: move;
    }
    .plant .shadow {
      fill: rgba(0, 0, 0, 0.18);
    }
    .plant .crown {
      fill: var(--pg-leaf-soft);
    }
    .plant .sprout {
      fill: var(--pg-leaf);
    }
    .plant .ring {
      fill: none;
      stroke: var(--ring, var(--success-color, #43a047));
      stroke-width: 2.5;
      vector-effect: non-scaling-stroke;
    }
    .plant.status-watch {
      --ring: var(--warning-color, #ffa600);
    }
    .plant.status-problem {
      --ring: var(--error-color, #db4437);
    }
    .plant.status-dead,
    .plant.status-removed {
      --ring: var(--disabled-text-color, #9e9e9e);
      opacity: 0.6;
    }
    .plant.selected .ring {
      stroke: var(--pg-accent);
      stroke-width: 4;
    }
    .plant-label {
      display: none;
      font-size: calc(var(--mpp) * 11px);
      dominant-baseline: hanging;
      transform: translateY(calc(var(--mpp) * 3px));
    }
    svg[data-labels] .plant-label,
    .plant.selected .plant-label,
    .plant:hover .plant-label {
      display: inline;
    }

    /* ---------------------------------------------- handles and drafts */
    .handle {
      r: calc(var(--mpp) * 6px);
      fill: var(--pg-surface);
      stroke: var(--pg-accent);
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
    }
    .handle-hit {
      r: calc(var(--mpp) * 16px);
      fill: transparent;
    }
    .handle-group {
      cursor: grab;
    }
    .handle-group.midpoint .handle {
      r: calc(var(--mpp) * 4px);
      fill: var(--pg-accent);
      opacity: 0.6;
    }
    .handle-group.rotate .handle {
      fill: var(--pg-accent);
    }
    .handle-group.close .handle {
      r: calc(var(--mpp) * 8px);
      fill: color-mix(in srgb, var(--pg-accent) 30%, transparent);
    }
    .rotate-arm {
      stroke: var(--pg-accent);
      stroke-width: 1.5;
      vector-effect: non-scaling-stroke;
    }
    .draft .body {
      fill: color-mix(in srgb, var(--pg-accent) 18%, transparent);
      stroke: var(--pg-accent);
      stroke-width: 2;
      stroke-dasharray: 6 4;
      vector-effect: non-scaling-stroke;
    }

    /* ---------------------------------------------- overlay */
    .overlay {
      position: absolute;
      inset: auto auto 12px 12px;
      display: flex;
      align-items: flex-end;
      gap: 12px;
      pointer-events: none;
      color: var(--pg-text);
      font-size: 12px;
    }
    .north {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--pg-surface);
      box-shadow: var(--pg-shadow);
      font-weight: 700;
    }
    .scale {
      display: grid;
      gap: 2px;
      padding: 4px 8px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--pg-surface) 85%, transparent);
    }
    .scale-bar {
      height: 6px;
      border: 2px solid var(--pg-text);
      border-top: none;
    }
  `;
	}
});
// src/components/plant-card.ts
function Y(e, t = "/plant-garden") {
	return `${t}/plants/${e.id}`;
}
L("pg-plant-card", class extends F {
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
		e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || (e.preventDefault(), z(Y(this.plant, this.prefix)));
	}
	render() {
		let { plant: e, t } = this, n = fn(e.age_months_now, t), r = q(e.height_cm, this.language), i = [e.scientific_name, e.variety && `'${e.variety}'`].filter(Boolean).join(" ");
		return w`
      <a class="card" href=${Y(e, this.prefix)} @click=${this._open}>
        <div class="cover">
          ${e.cover ? w`<img
                  src=${e.cover.urls.thumb}
                  srcset="${e.cover.urls.thumb} 360w, ${e.cover.urls.medium} 1024w"
                  sizes="(max-width: 600px) 50vw, 280px"
                  alt=""
                  loading="lazy"
                  decoding="async"
                />` : w`<div class="placeholder">${I(s)}</div>`}
          ${e.status === "healthy" ? D : w`<span class="badge status status-${e.status}"
                  >${t(`status.${e.status}`)}</span
                >`}
        </div>
        <div class="body">
          <h3>${e.name}</h3>
          ${i ? w`<p class="latin">${i}</p>` : D}
          <p class="meta">
            <span>${t(`category.${e.category}`)}</span>
            ${n ? w`<span>${n}</span>` : D}
            ${r ? w`<span>${I("M3,5V21H9V19.5H7V18H9V16.5H5V15H9V13.5H7V12H9V10.5H5V9H9V5H10.5V9H12V7H13.5V9H15V5H16.5V9H18V7H19.5V9H21V3H5A2,2 0 0,0 3,5M6,7A1,1 0 0,1 5,6A1,1 0 0,1 6,5A1,1 0 0,1 7,6A1,1 0 0,1 6,7Z")}${r}</span>` : D}
            ${e.photo_count ? w`<span
                    >${I("M20,4H16.83L15,2H9L7.17,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6A2,2 0 0,0 20,4M20,18H4V6H8.05L9.88,4H14.12L15.95,6H20V18M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15Z")}${t(e.photo_count === 1 ? "plants.photos_one" : "plants.photos_other", { n: e.photo_count })}</span
                  >` : D}
          </p>
        </div>
      </a>
    `;
	}
	static {
		this.styles = [R, h`
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
// src/util/plant-form.ts
var X = (e) => e == null ? "" : String(e);
function Nn(e = W()) {
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
function Pn(e, t = W()) {
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
function Fn(e) {
	let t = Q(e);
	return t === null ? 0 : Math.max(0, Math.round(t));
}
function In(e) {
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
			age_months: Fn(e.age_years) * 12 + Fn(e.age_months),
			on: e.age_on || W()
		} : null,
		tags: e.tags.split(",").map((e) => e.trim()).filter(Boolean)
	};
}
function Ln(e, t) {
	return JSON.stringify(e) === JSON.stringify(t);
}
function Rn(e, t) {
	let n = {};
	for (let r of Object.keys(e)) {
		let i = e[r];
		t ? Ln(i, t[r]) || Object.assign(n, { [r]: i }) : i !== null && !(Array.isArray(i) && i.length === 0) && Object.assign(n, { [r]: i });
	}
	return n;
}
function zn(e) {
	let { name: t, scientific_name: n, variety: r, family: i, notes: a, category: o, location_type: s, light: c, water_need: l, soil_type: u, status: d, min_temperature_c: f, root_depth_cm: p, planted_on: m, age: h, tags: ee } = e;
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
		age: h,
		tags: ee
	};
}
// src/util/exif.ts
var Bn = 34665, Vn = 306, Hn = 36867, Un = 36881, Wn = 2;
function Gn(e, t) {
	let { view: n, start: r, little: i } = e;
	if (n.getUint16(t + 2, i) !== Wn) return null;
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
function Kn(e, t) {
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
function qn(e, t) {
	let n = e.getUint16(t);
	if (n !== 18761 && n !== 19789) return null;
	let r = {
		view: e,
		start: t,
		little: n === 18761
	};
	if (e.getUint16(t + 2, r.little) !== 42) return null;
	let i = Kn(r, e.getUint32(t + 4, r.little)), a = null, o = null, s = i.get(Bn);
	if (s !== void 0) {
		let t = Kn(r, e.getUint32(s + 8, r.little)), n = t.get(Hn);
		n !== void 0 && (a = Gn(r, n));
		let i = t.get(Un);
		i !== void 0 && (o = Gn(r, i));
	}
	if (!a) {
		let e = i.get(Vn);
		e !== void 0 && (a = Gn(r, e));
	}
	let c = a?.trim().match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
	if (!c) return null;
	let [, l, u, d, f, p, m] = c;
	return `${l}-${u}-${d}T${f}:${p}:${m}${o && /^[+-]\d{2}:\d{2}$/.test(o) ? o : ""}`;
}
function Jn(e) {
	let t = new DataView(e);
	if (t.byteLength < 4 || t.getUint16(0) !== 65496) return null;
	let n = 2;
	try {
		for (; n + 4 <= t.byteLength;) {
			let e = t.getUint16(n);
			if ((e & 65280) != 65280 || e === 65498 || e === 65497) return null;
			let r = t.getUint16(n + 2);
			if (e === 65505 && n + 10 <= t.byteLength && t.getUint32(n + 4) === 1165519206 && t.getUint16(n + 8) === 0) return qn(t, n + 10);
			n += 2 + r;
		}
	} catch {
		return null;
	}
	return null;
}
// src/util/image.ts
var Yn = 2560, Xn = 4194304;
function Zn(e, t, n = Yn) {
	let r = Math.min(1, n / Math.max(e, t));
	return {
		width: Math.round(e * r),
		height: Math.round(t * r)
	};
}
function Qn(e) {
	return `${e.replace(/\.[^.]+$/, "") || "photo"}.jpg`;
}
async function $n(e, t, n) {
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
async function er(e) {
	let t = (e.type === "image/jpeg" ? Jn(await e.arrayBuffer()) : null) ?? (e.lastModified ? new Date(e.lastModified).toISOString() : null), n;
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
		let r = Zn(n.width, n.height);
		return e.type === "image/jpeg" && e.size <= Xn && r.width === n.width ? {
			blob: e,
			filename: e.name,
			takenAt: t
		} : {
			blob: await $n(n, r.width, r.height),
			filename: Qn(e.name),
			takenAt: t
		};
	} finally {
		n.close();
	}
}
// src/util/upload.ts
var tr = /* @__PURE__ */ new Set([
	"invalid_image",
	"unsupported_format",
	"image_too_large"
]);
function nr(e, t) {
	if (e instanceof it) {
		if (e.status === 413) return t("upload.too_large");
		if (e.code && tr.has(e.code)) return t(`upload.${e.code}`);
	}
	return t("upload.failed");
}
async function rr(e, t, n, r, i) {
	let a = {
		photos: [],
		errors: []
	};
	for (let [o, s] of n.entries()) {
		i?.(o + 1, n.length);
		try {
			let n = await er(s);
			a.photos.push(await at(e, {
				plantId: t,
				file: n.blob,
				filename: n.filename,
				takenAt: n.takenAt
			}));
		} catch (e) {
			a.errors.push(`${s.name}: ${nr(e, r)}`);
		}
	}
	return a;
}
L("pg-plant-form", class extends F {
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
		this._plant = e, this._state = e ? Pn(e) : Nn(), this._files = [], this._height = "", this._width = "", this._busy = !1, this._progress = "", this._errors = [], this._created = void 0;
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
		let t = In(this._state);
		if (!t.name) this._errors = [this.t("form.name_required")];
		else {
			this._busy = !0, this._errors = [];
			try {
				if (this._plant) {
					let e = Rn(t, zn(this._plant)), n = Object.keys(e).length ? await Xe(this.hass, this._plant.id, e) : this._plant;
					this._finish(n, !1);
				} else await this._create(t);
			} catch (e) {
				this._errors = [P(e)];
			} finally {
				this._busy = !1, this._progress = "";
			}
		}
	}
	async _create(e) {
		let t = await Ye(this.hass, {
			...Rn(e, null),
			name: e.name
		}), n = Q(this._height), r = Q(this._width), i = [];
		if (n !== null || r !== null) try {
			await ct(this.hass, t.id, {
				measured_on: W(),
				height_cm: n,
				width_cm: r
			});
		} catch (e) {
			i.push(P(e));
		}
		if (this._files.length) {
			let e = await rr(this.hass, t.id, this._files, this.t, (e, t) => {
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
		return w`<select id=${e} .value=${i} @change=${this._input(e)}>
      ${r ? w`<option value="" ?selected=${i === ""}>${this.t("common.not_set")}</option>` : D}
      ${t.map((e) => w`<option value=${e} ?selected=${i === e}>
            ${this.t(`${n}.${e}`)}
          </option>`)}
    </select>`;
	}
	_text(e, t, n = "text") {
		return w`<label class="field">
      <span>${this.t(t)}</span>
      <input id=${e} type=${n} .value=${this._state[e]} @input=${this._input(e)} />
    </label>`;
	}
	render() {
		let { t } = this, n = !!this._plant, r = n ? t("form.edit_title", { name: this._plant?.name ?? "" }) : t("form.create_title");
		return w`
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
              ${I(e)}
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
                  ${this._select("category", yt, "category", !1)}</label
                >
                <label class="field"
                  ><span>${t("field.location_type")}</span>
                  ${this._select("location_type", bt, "location", !1)}</label
                >
                <label class="field"
                  ><span>${t("field.light")}</span>
                  ${this._select("light", xt, "light", !0)}</label
                >
                <label class="field"
                  ><span>${t("field.water_need")}</span>
                  ${this._select("water_need", St, "water", !0)}</label
                >
                <label class="field"
                  ><span>${t("field.soil_type")}</span>
                  ${this._select("soil_type", Ct, "soil", !0)}</label
                >
                ${n ? w`<label class="field"
                        ><span>${t("field.status")}</span>
                        ${this._select("status", wt, "status", !1)}</label
                      >` : D}
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

            ${n ? D : this._renderStart()}

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
            ${this._progress ? w`<span class="progress muted">${this._progress}</span>` : D}
            ${this._errors.length ? w`<ul class="errors error-text" role="alert">
                    ${this._errors.map((e) => w`<li>${e}</li>`)}
                  </ul>` : D}
            ${this._created ? D : w`<button type="button" class="button text" @click=${this.close}>
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
		return w`<fieldset ?disabled=${this._busy || !!this._created}>
      <legend>${e("form.section_start")}</legend>
      <div class="grid">
        <label class="field wide files">
          <span>${e("form.photos")}</span>
          <span class="file-button button secondary">
            ${I(n)} ${e("detail.add_photos")}
            ${this._files.length ? w`<b>· ${e("form.photos_selected", { n: this._files.length })}</b>` : D}
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
		this.styles = [R, h`
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
// src/util/history.ts
var ir = class extends EventTarget {
	constructor(e = 100) {
		super(), this._limit = e, this._done = [], this._undone = [], this._busy = !1;
	}
	get canUndo() {
		return !this._busy && this._done.length > 0;
	}
	get canRedo() {
		return !this._busy && this._undone.length > 0;
	}
	async execute(e) {
		await this._guard(async () => {
			await e.run(), this._done.push(e), this._done.length > this._limit && this._done.shift(), this._undone = [];
		});
	}
	async undo() {
		let e = this._done.at(-1);
		e && !this._busy && await this._guard(async () => {
			await e.undo(), this._done.pop(), this._undone.push(e);
		});
	}
	async redo() {
		let e = this._undone.at(-1);
		e && !this._busy && await this._guard(async () => {
			await e.run(), this._undone.pop(), this._done.push(e);
		});
	}
	clear() {
		this._done = [], this._undone = [], this.dispatchEvent(new Event("change"));
	}
	async _guard(e) {
		this._busy = !0, this.dispatchEvent(new Event("change"));
		try {
			await e();
		} finally {
			this._busy = !1, this.dispatchEvent(new Event("change"));
		}
	}
}, ar = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function or(e = Date.now()) {
	let t = "", n = e;
	for (let e = 0; e < 10; e++) t = (ar[n % 32] ?? "0") + t, n = Math.floor(n / 32);
	let r = /* @__PURE__ */ new Uint8Array(16);
	crypto.getRandomValues(r);
	let i = "";
	for (let e of r) i += ar[e % 32];
	return t + i;
}
// src/components/hero.ts
var sr = w`
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
`, cr = h`
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
// src/views/plants-view.ts
function lr(e, t) {
	let n = t.trim().toLocaleLowerCase();
	return !n || [
		e.name,
		e.scientific_name,
		e.variety,
		e.family,
		...e.tags
	].filter((e) => !!e).some((e) => e.toLocaleLowerCase().includes(n));
}
L("pg-plants-view", class extends F {
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
		this.store.refresh(), e.detail.created && z(Y(e.detail.plant, this.prefix));
	}
	render() {
		let { t: e } = this, t = this.store.plants, n = wt.filter((e) => t.some((t) => t.status === e)), i = t.filter((e) => (this._status === "all" || e.status === this._status) && lr(e, this._query));
		return w`
      ${t.length ? w`
              <div class="filters">
                <label class="search">
                  ${I(r)}
                  <span class="sr-only">${e("plants.search")}</span>
                  <input
                    type="search"
                    placeholder=${e("plants.search")}
                    .value=${this._query}
                    @input=${(e) => this._query = e.target.value}
                  />
                </label>
                ${n.length > 1 ? w`<div class="chips" role="group">
                        <button
                          class="chip"
                          aria-pressed=${this._status === "all"}
                          @click=${() => this._status = "all"}
                        >
                          ${e("plants.filter_all")} · ${t.length}
                        </button>
                        ${n.map((t) => w`<button
                              class="chip"
                              aria-pressed=${this._status === t}
                              @click=${() => this._status = t}
                            >
                              <span class="status status-${t}">${e(`status.${t}`)}</span>
                            </button>`)}
                      </div>` : D}
              </div>
              ${i.length ? w`<div class="grid">
                      ${i.map((e) => w`<pg-plant-card
                            .hass=${this.hass}
                            .plant=${e}
                            .prefix=${this.prefix}
                          ></pg-plant-card>`)}
                    </div>` : w`<p class="muted empty-search">${e("plants.no_results")}</p>`}
            ` : w`
              <section class="card hero welcome">
                ${sr}
                <div class="welcome-text">
                  <h2>${e("plants.empty_title", { garden: this.gardenName })}</h2>
                  <p class="muted">${e("plants.empty_body")}</p>
                  <button class="button" @click=${this._openForm}>
                    ${I(o)} ${e("plants.add")}
                  </button>
                </div>
              </section>
            `}
      ${t.length ? w`<button class="button fab" @click=${this._openForm} aria-label=${e("plants.add")}>
              ${I(o)} <span>${e("plants.add")}</span>
            </button>` : D}
      <pg-plant-form .hass=${this.hass} @plant-saved=${this._onSaved}></pg-plant-form>
    `;
	}
	static {
		this.styles = [
			R,
			cr,
			h`
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
// src/views/garden-view.ts
var ur = "plant-garden.viewport.v1", dr = "plant-garden.snap.v1", fr = [
	0,
	.1,
	.25,
	.5,
	1
], pr = {
	boundary: -10,
	lawn: -6,
	terrace: -5,
	path: -4,
	pond: -3,
	bed: -2,
	raised_bed: -1,
	hedge: 0,
	other: 0,
	greenhouse: 4,
	house: 5,
	roof: 6
};
function mr(e, t) {
	try {
		let n = localStorage.getItem(e), r = n ? JSON.parse(n) : null;
		return t(r) ? r : null;
	} catch {
		return null;
	}
}
function hr(e, t) {
	try {
		localStorage.setItem(e, JSON.stringify(t));
	} catch {}
}
var gr = (e) => typeof e == "number" && fr.includes(e);
L("pg-garden-view", class extends F {
	static {
		this.properties = {
			store: { attribute: !1 },
			prefix: {},
			focusPlantId: { attribute: !1 },
			_mode: { state: !0 },
			_tool: { state: !0 },
			_newKind: { state: !0 },
			_snap: { state: !0 },
			_selection: { state: !0 },
			_hover: { state: !0 },
			_armed: { state: !0 },
			_query: { state: !0 },
			_error: { state: !0 },
			_drag: { state: !0 },
			_historyTick: { state: !0 }
		};
	}
	constructor() {
		super(), this._history = new ir(), this._fitted = !1, this._focused = null, this._onStoreChange = () => {
			this.requestUpdate(), this._initViewport();
		}, this._onHistoryChange = () => this._historyTick += 1, this._onKeyDown = (e) => {
			let t = e.composedPath()[0];
			if (t && [
				"INPUT",
				"TEXTAREA",
				"SELECT"
			].includes(t.tagName)) return;
			let n = e.ctrlKey || e.metaKey;
			n && e.key.toLowerCase() === "z" ? (e.preventDefault(), e.shiftKey ? this._history.redo() : this._history.undo()) : n && e.key.toLowerCase() === "y" && (e.preventDefault(), this._history.redo());
		}, this._onTrayPointerMove = (e) => {
			let t = this._drag;
			if (!t || e.pointerId !== t.pointerId) return;
			let n = Math.hypot(e.clientX - t.startX, e.clientY - t.startY), r = t.dragging || e.pointerType !== "touch" && n > 5;
			this._drag = {
				...t,
				x: e.clientX,
				y: e.clientY,
				dragging: r
			};
		}, this._onTrayPointerUp = (e) => {
			let t = this._drag;
			if (!t || e.pointerId !== t.pointerId) return;
			if (this._endTrayDrag(), !t.dragging) {
				this._arm(t.plantId);
				return;
			}
			let n = this._canvas, r = n?.getBoundingClientRect();
			if (n && r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
				let r = Qt(n.planPoint(e.clientX, e.clientY), this._snap);
				this._onPlace(new CustomEvent("place", { detail: {
					plantId: t.plantId,
					at: r
				} }));
			}
		}, this._onTrayPointerCancel = () => this._endTrayDrag(), this.prefix = "/plant-garden", this.focusPlantId = null, this._mode = "view", this._tool = "select", this._newKind = "bed", this._snap = mr(dr, gr) ?? .25, this._selection = null, this._hover = null, this._armed = null, this._query = "", this._error = "", this._drag = null, this._historyTick = 0;
	}
	connectedCallback() {
		super.connectedCallback(), this.store?.addEventListener("change", this._onStoreChange), this._history.addEventListener("change", this._onHistoryChange), this.addEventListener("keydown", this._onKeyDown);
	}
	disconnectedCallback() {
		super.disconnectedCallback(), this.store?.removeEventListener("change", this._onStoreChange), this._history.removeEventListener("change", this._onHistoryChange), this.removeEventListener("keydown", this._onKeyDown), this._endTrayDrag(), clearTimeout(this._errorTimer);
	}
	firstUpdated() {
		let e = mr(ur, Tn);
		e && this._canvas && (this._canvas.viewport = e, this._fitted = !0), this._initViewport();
	}
	updated(e) {
		e.has("focusPlantId") && this._focusPlant();
	}
	get _canvas() {
		return this.renderRoot.querySelector("pg-garden-canvas");
	}
	get _plants() {
		return this.store?.plants ?? [];
	}
	get _shapes() {
		return this.store?.layout?.shapes ?? [];
	}
	_initViewport() {
		!this._fitted && this.store?.loaded && this._canvas && (this._fitted = !0, this.updateComplete.then(() => this._canvas?.fit()));
	}
	_focusPlant() {
		let e = this.focusPlantId;
		if (!e || e === this._focused) return;
		let t = this.store?.getPlant(e);
		t?.position && this._canvas && (this._focused = e, this._fitted = !0, this._canvas.centerOn(t.position, Math.max(8, U(t) * 6)), this._selection = {
			type: "plant",
			id: e
		});
	}
	async _execute(e) {
		try {
			await this._history.execute(e);
		} catch (e) {
			this._showError(e);
		}
	}
	_showError(e) {
		this._error = this.t("plan.save_failed", { message: P(e) }), clearTimeout(this._errorTimer), this._errorTimer = setTimeout(() => this._error = "", 6e3);
	}
	async _setPosition(e, t) {
		let n = this.store.getPlant(e)?.position ?? null;
		this.store.patchPlant(e, { position: t });
		try {
			await $e(this.hass, [{
				plant_id: e,
				position: t
			}]);
		} catch (t) {
			throw this.store.patchPlant(e, { position: n }), t;
		}
	}
	async _setCrown(e, t) {
		let n = this.store.getPlant(e)?.crown_diameter_m ?? null;
		this.store.patchPlant(e, { crown_diameter_m: t });
		try {
			await Xe(this.hass, e, { crown_diameter_m: t });
		} catch (t) {
			throw this.store.patchPlant(e, { crown_diameter_m: n }), t;
		}
	}
	async _putShape(e) {
		let t = this.store.getShape(e.id);
		this.store.putShape(e);
		try {
			await tt(this.hass, e);
		} catch (n) {
			throw t ? this.store.putShape(t) : this.store.removeShape(e.id), n;
		}
	}
	async _removeShape(e) {
		this.store.removeShape(e.id);
		try {
			await nt(this.hass, e.id);
		} catch (t) {
			throw this.store.putShape(e), t;
		}
	}
	_movePlant(e, t, n) {
		return this._execute({
			label: "move-plant",
			run: () => this._setPosition(e, n),
			undo: () => this._setPosition(e, t)
		});
	}
	_replaceShape(e, t) {
		return this._execute({
			label: "change-shape",
			run: () => this._putShape(t),
			undo: () => this._putShape(e)
		});
	}
	_onSelect(e) {
		this._selection = e.detail.selection, e.detail.selection || (this._hover = null);
	}
	_onHover(e) {
		this._hover = e.detail.plantId ? e.detail : null;
	}
	_onMovePlant(e) {
		let { plantId: t, from: n, to: r } = e.detail;
		this._movePlant(t, n, r);
	}
	_onResizeCrown(e) {
		let { plantId: t, from: n, to: r } = e.detail;
		this._execute({
			label: "crown",
			run: () => this._setCrown(t, r),
			undo: () => this._setCrown(t, n)
		});
	}
	_onCreateShape(e) {
		let t = {
			id: or(),
			kind: this._newKind,
			geometry: e.detail.geometry,
			label: null,
			plant_id: null,
			soil_type: null,
			locked: !1,
			z: pr[this._newKind]
		};
		this._tool = "select", this._selection = {
			type: "shape",
			id: t.id
		}, this._execute({
			label: "create-shape",
			run: () => this._putShape(t),
			undo: () => this._removeShape(t)
		});
	}
	_onChangeShape(e) {
		let t = this.store.getShape(e.detail.shapeId);
		t && this._replaceShape({
			...t,
			geometry: e.detail.from
		}, {
			...t,
			geometry: e.detail.to
		});
	}
	_onPlace(e) {
		let t = this.store.getPlant(e.detail.plantId);
		this._armed = null, t && (this._selection = {
			type: "plant",
			id: t.id
		}, this._movePlant(t.id, t.position, e.detail.at));
	}
	_onDeleteSelection() {
		let e = this._selection;
		if (e) {
			if (this._selection = null, e.type === "shape") {
				let t = this.store.getShape(e.id);
				if (!t) return;
				this._execute({
					label: "delete-shape",
					run: () => this._removeShape(t),
					undo: () => this._putShape(t)
				});
			} else {
				let t = this.store.getPlant(e.id);
				t?.position && this._movePlant(t.id, t.position, null);
			}
		}
	}
	_onCancel() {
		this._armed = null, this._selection = null, this._hover = null;
	}
	_onViewport(e) {
		hr(ur, e.detail.viewport);
	}
	_setMode(e) {
		this._mode = e, this._tool = "select", this._armed = null, this._hover = null;
	}
	_setSnap(e) {
		this._snap = Number(e.target.value), hr(dr, this._snap);
	}
	_arm(e) {
		this._armed = this._armed === e ? null : e, this._selection = null;
	}
	_onTrayPointerDown(e, t) {
		e.button === 0 && (this._drag = {
			plantId: t,
			pointerId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			x: e.clientX,
			y: e.clientY,
			dragging: !1
		}, window.addEventListener("pointermove", this._onTrayPointerMove), window.addEventListener("pointerup", this._onTrayPointerUp), window.addEventListener("pointercancel", this._onTrayPointerCancel));
	}
	_endTrayDrag() {
		this._drag = null, window.removeEventListener("pointermove", this._onTrayPointerMove), window.removeEventListener("pointerup", this._onTrayPointerUp), window.removeEventListener("pointercancel", this._onTrayPointerCancel);
	}
	_onPlantSaved(e) {
		this.store.refresh(), e.detail.created && (this._armed = e.detail.plant.id);
	}
	render() {
		let e = this._mode === "edit";
		return w`
      <div class="layout ${e ? "editing" : ""}">
        <div class="stage">
          <pg-garden-canvas
            .hass=${this.hass}
            .plants=${this._plants}
            .shapes=${this._shapes}
            .mode=${this._mode}
            .tool=${this._tool}
            .selection=${this._selection}
            .snapStep=${this._snap}
            .armedPlantId=${this._armed}
            @select=${this._onSelect}
            @hover=${this._onHover}
            @move-plant=${this._onMovePlant}
            @resize-crown=${this._onResizeCrown}
            @create-shape=${this._onCreateShape}
            @change-shape=${this._onChangeShape}
            @place=${this._onPlace}
            @delete-selection=${this._onDeleteSelection}
            @cancel=${this._onCancel}
            @viewport-change=${this._onViewport}
            @view-moved=${() => {
			this._selection && this.requestUpdate();
		}}
          ></pg-garden-canvas>
          ${this._renderToolbar()} ${this._renderHint()}
          ${e ? D : this._renderInfoCard()}
          ${this._error ? w`<div class="toast error-text" role="alert">${this._error}</div>` : D}
        </div>
        ${e ? this._renderSide() : D}
      </div>
      ${this._renderGhost()}
      <pg-plant-form .hass=${this.hass} @plant-saved=${this._onPlantSaved}></pg-plant-form>
    `;
	}
	_renderToolbar() {
		let { t: e } = this, t = this._mode === "edit";
		return w`<div class="toolbar">
      <div class="group segmented" role="group" aria-label=${e("plan.mode")}>
        <button
          class="seg"
          aria-pressed=${!t}
          @click=${() => this._setMode("view")}
          title=${e("plan.mode_view")}
        >
          ${I("M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9M12,4.5C17,4.5 21.27,7.61 23,12C21.27,16.39 17,19.5 12,19.5C7,19.5 2.73,16.39 1,12C2.73,7.61 7,4.5 12,4.5M3.18,12C4.83,15.36 8.24,17.5 12,17.5C15.76,17.5 19.17,15.36 20.82,12C19.17,8.64 15.76,6.5 12,6.5C8.24,6.5 4.83,8.64 3.18,12Z")}<span>${e("plan.mode_view")}</span>
        </button>
        <button
          class="seg"
          aria-pressed=${t}
          @click=${() => this._setMode("edit")}
          title=${e("plan.mode_edit")}
        >
          ${I(a)}<span>${e("plan.mode_edit")}</span>
        </button>
      </div>
      ${t ? w`<div class="group" role="group">
                ${[
			[
				"select",
				"M10.07,14.27C10.57,14.03 11.16,14.25 11.4,14.75L13.7,19.74L15.5,18.89L13.19,13.91C12.95,13.41 13.17,12.81 13.67,12.58L13.95,12.5L16.25,12.05L8,5.12V15.9L9.82,14.43L10.07,14.27M13.64,21.97C13.14,22.21 12.54,22 12.31,21.5L10.13,16.76L7.62,18.78C7.45,18.92 7.24,19 7,19A1,1 0 0,1 6,18V3A1,1 0 0,1 7,2C7.24,2 7.47,2.09 7.64,2.23L7.65,2.22L19.14,11.86C19.57,12.22 19.62,12.85 19.27,13.27C19.12,13.45 18.91,13.57 18.7,13.61L15.54,14.23L17.74,18.96C18,19.46 17.76,20.05 17.26,20.28L13.64,21.97Z",
				"plan.tool_select"
			],
			[
				"rect",
				"M4,6V19H20V6H4M18,17H6V8H18V17Z",
				"plan.tool_rect"
			],
			[
				"circle",
				"M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",
				"plan.tool_circle"
			],
			[
				"polygon",
				"M2,2V8H4.28L5.57,16H4V22H10V20.06L15,20.05V22H21V16H19.17L20,9H22V3H16V6.53L14.8,8H9.59L8,5.82V2M4,4H6V6H4M18,5H20V7H18M6.31,8H7.11L9,10.59V14H15V10.91L16.57,9H18L17.16,16H15V18.06H10V16H7.6M11,10H13V12H11M6,18H8V20H6M17,18H19V20H17",
				"plan.tool_polygon"
			]
		].map(([t, n, r]) => w`<button
                      class="tool"
                      aria-pressed=${this._tool === t}
                      @click=${() => {
			this._tool = t, this._armed = null;
		}}
                      aria-label=${e(r)}
                      title=${e(r)}
                    >
                      ${I(n)}
                    </button>`)}
              </div>
              ${this._tool === "select" ? D : w`<label class="group compact">
                      <span class="sr-only">${e("plan.new_kind")}</span>
                      <select
                        .value=${this._newKind}
                        @change=${(e) => this._newKind = e.target.value}
                      >
                        ${Tt.map((t) => w`<option value=${t} ?selected=${t === this._newKind}>
                              ${e(`kind.${t}`)}
                            </option>`)}
                      </select>
                    </label>`}
              <label class="group compact">
                <span class="label-text">${e("plan.snap")}</span>
                <select @change=${this._setSnap}>
                  ${fr.map((t) => w`<option value=${t} ?selected=${t === this._snap}>
                        ${t === 0 ? e("plan.snap_off") : q(t * 100, this.language)}
                      </option>`)}
                </select>
              </label>
              <div class="group" role="group">
                <button
                  class="tool"
                  ?disabled=${!this._history.canUndo}
                  @click=${() => void this._history.undo()}
                  aria-label=${e("plan.undo")}
                  title=${e("plan.undo")}
                >
                  ${I("M12.5,8C9.85,8 7.45,9 5.6,10.6L2,7V16H11L7.38,12.38C8.77,11.22 10.54,10.5 12.5,10.5C16.04,10.5 19.05,12.81 20.1,16L22.47,15.22C21.08,11.03 17.15,8 12.5,8Z")}
                </button>
                <button
                  class="tool"
                  ?disabled=${!this._history.canRedo}
                  @click=${() => void this._history.redo()}
                  aria-label=${e("plan.redo")}
                  title=${e("plan.redo")}
                >
                  ${I("M18.4,10.6C16.55,9 14.15,8 11.5,8C6.85,8 2.92,11.03 1.54,15.22L3.9,16C4.95,12.81 7.95,10.5 11.5,10.5C13.45,10.5 15.23,11.22 16.62,12.38L13,16H22V7L18.4,10.6Z")}
                </button>
              </div>` : D}
      <button
        class="tool group fit"
        @click=${() => this._canvas?.fit()}
        aria-label=${e("plan.fit")}
        title=${e("plan.fit")}
      >
        ${I("M17 4H20C21.1 4 22 4.9 22 6V8H20V6H17V4M4 8V6H7V4H4C2.9 4 2 4.9 2 6V8H4M20 16V18H17V20H20C21.1 20 22 19.1 22 18V16H20M7 18H4V16H2V18C2 19.1 2.9 20 4 20H7V18M16 10V14H8V10H16M18 8H6V16H18V8Z")}
      </button>
    </div>`;
	}
	_renderHint() {
		let { t: e } = this, t = "";
		return this._armed ? t = e("plan.place_hint", { name: this.store.getPlant(this._armed)?.name ?? "" }) : this._mode === "edit" && this._tool === "polygon" ? t = e("plan.polygon_hint") : this._mode === "edit" && this._tool !== "select" ? t = e("plan.draw_hint") : this._mode === "view" && !this._shapes.length && !this._plants.some((e) => e.position) && (t = e("plan.empty_hint")), t ? w`<div class="hint" role="status">
      <span>${t}</span>
      ${this._armed ? w`<button class="button text" @click=${() => this._armed = null}>
              ${e("plan.cancel")}
            </button>` : D}
    </div>` : D;
	}
	_infoPlant() {
		let e = this.renderRoot.querySelector(".stage")?.getBoundingClientRect();
		if (!e) return null;
		if (this._selection?.type === "plant") {
			let t = this.store.getPlant(this._selection.id);
			if (t?.position && this._canvas) {
				let n = this._canvas.screenPoint(t.position);
				return {
					plant: t,
					x: n.x - e.left,
					y: n.y - e.top,
					pinned: !0
				};
			}
		}
		if (this._hover?.plantId) {
			let t = this.store.getPlant(this._hover.plantId);
			if (t) return {
				plant: t,
				x: this._hover.x - e.left,
				y: this._hover.y - e.top,
				pinned: !1
			};
		}
		return null;
	}
	_renderInfoCard() {
		let t = this._selection?.type === "shape" ? this.store.getShape(this._selection.id) : null;
		if (t) return this._renderShapeCard(t);
		let n = this._infoPlant();
		if (!n) return D;
		let { plant: r, x: a, y: o, pinned: c } = n, { t: l, language: u } = this, d = [
			fn(r.age_months_now, l),
			r.height_cm === null ? "" : `${l("field.height")} ${q(r.height_cm, u)}`,
			`Ø ${q(U(r) * 100, u)}`
		].filter(Boolean), f = `--x: ${Math.round(a)}px; --y: ${Math.round(o)}px`;
		return w`<article class="card info ${c ? "pinned" : "hover"}" style=${f}>
      <div class="info-photo">
        ${r.cover ? w`<img src=${r.cover.urls.medium} alt="" />` : w`<span class="placeholder">${I(s)}</span>`}
      </div>
      <div class="info-body">
        <div class="info-title">
          <h3>${r.name}</h3>
          ${c ? w`<button
                  class="icon-button small"
                  @click=${() => this._selection = null}
                  aria-label=${l("common.close")}
                >
                  ${I(e)}
                </button>` : D}
        </div>
        ${r.scientific_name ? w`<p class="latin">${r.scientific_name}</p>` : D}
        <p class="status status-${r.status}">${l(`status.${r.status}`)}</p>
        <p class="muted facts">${d.join(" · ")}</p>
        ${c ? w`<button
                class="button secondary"
                @click=${() => z(Y(r, this.prefix))}
              >
                ${I(i)} ${l("plan.details")}
              </button>` : D}
      </div>
    </article>`;
	}
	_renderShapeCard(t) {
		let { t: n, language: r } = this, i = t.plant_id ? this.store.getPlant(t.plant_id) : void 0;
		return w`<article class="card info pinned shape-card" style="--x: 50%; --y: 0px">
      <div class="info-body">
        <div class="info-title">
          <h3>${t.label ?? n(`kind.${t.kind}`)}</h3>
          <button
            class="icon-button small"
            @click=${() => this._selection = null}
            aria-label=${n("common.close")}
          >
            ${I(e)}
          </button>
        </div>
        <p class="muted">
          ${n(`kind.${t.kind}`)} · ${K(Yt(t.geometry), r, 1)} m²
        </p>
        ${i ? w`<button
                class="button secondary"
                @click=${() => z(Y(i, this.prefix))}
              >
                ${I(s)} ${i.name}
              </button>` : D}
      </div>
    </article>`;
	}
	_renderSide() {
		return w`<aside class="side">${this._renderProperties()} ${this._renderTray()}</aside>`;
	}
	_renderProperties() {
		let e = this._selection;
		if (!e) return D;
		if (e.type === "plant") {
			let t = this.store.getPlant(e.id);
			return t ? this._renderPlantProperties(t) : D;
		}
		let t = this.store.getShape(e.id);
		return t ? this._renderShapeProperties(t) : D;
	}
	_renderPlantProperties(t) {
		let { t: n, language: r } = this;
		return w`<section class="props">
      <div class="props-title">
        <h3>${t.name}</h3>
        <button
          class="icon-button small"
          @click=${() => this._selection = null}
          aria-label=${n("common.close")}
        >
          ${I(e)}
        </button>
      </div>
      <label class="field">
        <span>${n("plan.crown")}</span>
        <input
          type="number"
          min="0.05"
          step="0.05"
          inputmode="decimal"
          .value=${t.crown_diameter_m === null ? "" : String(t.crown_diameter_m)}
          placeholder=${n("plan.crown_auto", { size: q(U({
			...t,
			crown_diameter_m: null
		}) * 100, r) })}
          @change=${(e) => {
			let n = e.target.value.replace(",", "."), r = n.trim() === "" ? null : Number(n);
			if (r !== null && !(r >= .05 && r <= 100)) return;
			let i = t.crown_diameter_m;
			this._execute({
				label: "crown",
				run: () => this._setCrown(t.id, r),
				undo: () => this._setCrown(t.id, i)
			});
		}}
        />
      </label>
      <div class="props-actions">
        <button class="button secondary" @click=${() => z(Y(t, this.prefix))}>
          ${I(i)} ${n("plan.details")}
        </button>
        ${t.position ? w`<button
                class="button text danger"
                @click=${() => {
			this._selection = null, this._movePlant(t.id, t.position, null);
		}}
              >
                ${I("M16.6 14.2L15.2 15.6L17.6 18L15.2 20.4L16.6 21.8L19 19.4L21.4 21.8L22.8 20.4L20.4 18L22.8 15.6L21.4 14.2L19 16.6M9 6.5C10.4 6.5 11.5 7.6 11.5 9S10.4 11.5 9 11.5 6.5 10.4 6.5 9 7.6 6.5 9 6.5M9 2C12.9 2 16 5.1 16 9C16 14.2 9 22 9 22S2 14.2 2 9C2 5.1 5.1 2 9 2M9 4C6.2 4 4 6.2 4 9C4 10 4 12 9 18.7C14 12 14 10 14 9C14 6.2 11.8 4 9 4Z")} ${n("plan.unplace")}
              </button>` : D}
      </div>
    </section>`;
	}
	_renderShapeProperties(n) {
		let { t: r, language: i } = this, a = (e) => void this._replaceShape(n, {
			...n,
			...e
		}), o = n.kind === "bed" || n.kind === "raised_bed";
		return w`<section class="props">
      <div class="props-title">
        <h3>${n.label ?? r(`kind.${n.kind}`)}</h3>
        <button
          class="icon-button small"
          @click=${() => this._selection = null}
          aria-label=${r("common.close")}
        >
          ${I(e)}
        </button>
      </div>
      <label class="field">
        <span>${r("plan.kind")}</span>
        <select
          @change=${(e) => {
			let t = e.target.value;
			a({
				kind: t,
				z: pr[t]
			});
		}}
        >
          ${Tt.map((e) => w`<option value=${e} ?selected=${e === n.kind}>
                ${r(`kind.${e}`)}
              </option>`)}
        </select>
      </label>
      <label class="field">
        <span>${r("plan.label")}</span>
        <input
          maxlength="100"
          .value=${n.label ?? ""}
          @change=${(e) => a({ label: e.target.value.trim() || null })}
        />
      </label>
      <label class="field">
        <span>${r("plan.linked_plant")}</span>
        <select
          @change=${(e) => a({ plant_id: e.target.value || null })}
        >
          <option value="" ?selected=${!n.plant_id}>${r("plan.no_plant")}</option>
          ${this._plants.map((e) => w`<option value=${e.id} ?selected=${e.id === n.plant_id}>
                ${e.name}
              </option>`)}
        </select>
      </label>
      ${o ? w`<label class="field">
              <span>${r("field.soil_type")}</span>
              <select
                @change=${(e) => a({ soil_type: e.target.value || null })}
              >
                <option value="" ?selected=${!n.soil_type}>${r("common.not_set")}</option>
                ${Ct.map((e) => w`<option value=${e} ?selected=${e === n.soil_type}>
                      ${r(`soil.${e}`)}
                    </option>`)}
              </select>
            </label>` : D}
      <label class="check">
        <input
          type="checkbox"
          .checked=${n.locked}
          @change=${(e) => a({ locked: e.target.checked })}
        />
        <span>${r("plan.locked")}</span>
      </label>
      <p class="muted">${r("plan.area")}: ${K(Yt(n.geometry), i, 1)} m²</p>
      <div class="props-actions">
        <button class="button text danger" @click=${this._onDeleteSelection}>
          ${I(t)} ${r("plan.delete_shape")}
        </button>
      </div>
    </section>`;
	}
	_renderTray() {
		let { t: e } = this, t = this._plants.filter((e) => lr(e, this._query)), n = t.filter((e) => !e.position), i = t.filter((e) => e.position), a = (e) => w`<li>
        <button
          class="tray-item ${this._armed === e.id ? "armed" : ""}"
          @pointerdown=${(t) => this._onTrayPointerDown(t, e.id)}
          @keydown=${(t) => {
			(t.key === "Enter" || t.key === " ") && (t.preventDefault(), this._arm(e.id));
		}}
          aria-pressed=${this._armed === e.id}
        >
          ${e.cover ? w`<img src=${e.cover.urls.thumb} alt="" loading="lazy" draggable="false" />` : w`<span class="thumb-placeholder">${I(s)}</span>`}
          <span class="tray-name">${e.name}</span>
        </button>
      </li>`;
		return w`<section class="tray">
      <div class="props-title">
        <h3>${e("plan.tray")}</h3>
        <button
          class="button text"
          @click=${() => this.renderRoot.querySelector("pg-plant-form")?.open()}
        >
          ${I(o)} ${e("plan.new_plant")}
        </button>
      </div>
      <label class="search">
        ${I(r)}
        <span class="sr-only">${e("plants.search")}</span>
        <input
          type="search"
          placeholder=${e("plants.search")}
          .value=${this._query}
          @input=${(e) => this._query = e.target.value}
        />
      </label>
      <p class="muted small">${e("plan.tray_hint")}</p>
      ${this._plants.length ? D : w`<p class="muted">${e("plan.tray_empty")}</p>`}
      ${n.length ? w`<h4>${e("plan.tray_unplaced")}</h4>
              <ul>
                ${n.map(a)}
              </ul>` : D}
      ${i.length ? w`<h4>${e("plan.tray_placed")}</h4>
              <ul>
                ${i.map(a)}
              </ul>` : D}
    </section>`;
	}
	_renderGhost() {
		let e = this._drag;
		if (!e?.dragging) return D;
		let t = this.store.getPlant(e.plantId);
		return t ? w`<div class="ghost" style="left: ${e.x}px; top: ${e.y}px">
      ${t.cover ? w`<img src=${t.cover.urls.thumb} alt="" />` : w`<span class="thumb-placeholder">${I(s)}</span>`}
    </div>` : D;
	}
	static {
		this.styles = [R, h`
      :host {
        display: block;
        height: 100%;
      }
      .layout {
        display: flex;
        height: 100%;
      }
      .stage {
        position: relative;
        flex: 1;
        min-width: 0;
      }
      pg-garden-canvas {
        position: absolute;
        inset: 0;
      }

      /* ---------------------------------------------- toolbar */
      .toolbar {
        position: absolute;
        top: 12px;
        left: 12px;
        right: 12px;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        pointer-events: none;
      }
      .group {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 3px;
        border-radius: 12px;
        background: var(--pg-surface);
        box-shadow: var(--pg-shadow);
        pointer-events: auto;
      }
      .group.compact {
        padding: 3px 8px;
        gap: 6px;
        font-size: 13px;
      }
      .group.compact select {
        min-height: 34px;
        padding: 4px 8px;
        width: auto;
      }
      .label-text {
        color: var(--pg-text-muted);
      }
      .fit {
        margin-left: auto;
      }
      .seg,
      .tool {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 40px;
        height: 36px;
        padding: 0 10px;
        border: none;
        border-radius: 9px;
        background: transparent;
        color: var(--pg-text);
        font: inherit;
        font-size: 14px;
        cursor: pointer;
        justify-content: center;
      }
      .tool {
        padding: 0 8px;
      }
      .seg[aria-pressed="true"],
      .tool[aria-pressed="true"] {
        background: color-mix(in srgb, var(--pg-accent) 16%, transparent);
        color: var(--pg-accent);
      }
      .tool:disabled {
        opacity: 0.35;
        cursor: default;
      }
      .seg:focus-visible,
      .tool:focus-visible {
        outline: 2px solid var(--pg-accent);
      }
      .seg .icon,
      .tool .icon {
        width: 20px;
        height: 20px;
      }

      /* ---------------------------------------------- hint and toast */
      .hint,
      .toast {
        position: absolute;
        left: 50%;
        bottom: 16px;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 8px;
        max-width: calc(100% - 32px);
        padding: 8px 16px;
        border-radius: 999px;
        background: var(--pg-surface);
        box-shadow: var(--pg-shadow);
        font-size: 14px;
      }
      .toast {
        bottom: 64px;
        border-radius: 12px;
      }

      /* ---------------------------------------------- info card */
      .info {
        position: absolute;
        left: clamp(8px, calc(var(--x) + 18px), calc(100% - 288px));
        top: clamp(64px, calc(var(--y) - 40px), calc(100% - 300px));
        width: 280px;
        overflow: hidden;
        z-index: 2;
        animation: pop 140ms ease-out;
      }
      .info.hover {
        pointer-events: none;
      }
      .shape-card {
        left: auto;
        right: 12px;
        top: 64px;
      }
      @keyframes pop {
        from {
          opacity: 0;
          transform: translateY(4px);
        }
      }
      .info-photo {
        aspect-ratio: 16 / 10;
        background: var(--pg-leaf-soft);
      }
      .info-photo img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .placeholder,
      .thumb-placeholder {
        display: grid;
        place-items: center;
        height: 100%;
        color: var(--pg-leaf);
      }
      .info-body {
        display: grid;
        gap: 4px;
        padding: 12px 14px 14px;
      }
      .info-title,
      .props-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .info h3,
      .props h3,
      .tray h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 500;
      }
      .info p {
        margin: 0;
      }
      .latin {
        font-style: italic;
        color: var(--pg-text-muted);
        font-size: 13px;
      }
      .facts {
        font-size: 13px;
      }
      .info .button {
        margin-top: 6px;
        justify-self: start;
      }
      .icon-button.small {
        width: 32px;
        height: 32px;
      }
      .icon-button.small .icon {
        width: 18px;
        height: 18px;
      }

      /* ---------------------------------------------- side panel */
      .side {
        width: 300px;
        flex: none;
        overflow: auto;
        border-left: 1px solid var(--pg-divider);
        background: var(--pg-surface);
      }
      .props,
      .tray {
        display: grid;
        gap: 10px;
        padding: 14px 16px;
      }
      .props {
        border-bottom: 1px solid var(--pg-divider);
        background: color-mix(in srgb, var(--pg-accent) 5%, var(--pg-surface));
      }
      .props-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .check {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
      }
      .check input {
        width: 18px;
        min-height: 18px;
        height: 18px;
      }
      .props p {
        margin: 0;
        font-size: 13px;
      }
      .search {
        position: relative;
      }
      .search .icon {
        position: absolute;
        left: 10px;
        top: 50%;
        transform: translateY(-50%);
        width: 18px;
        height: 18px;
        color: var(--pg-text-muted);
      }
      .search input {
        padding-left: 34px;
        border-radius: 999px;
      }
      .small {
        font-size: 12px;
        margin: 0;
      }
      .tray h4 {
        margin: 6px 0 0;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--pg-text-muted);
      }
      .tray ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 6px;
      }
      .tray-item {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 6px 8px;
        border: 1px solid var(--pg-divider);
        border-radius: 12px;
        background: var(--pg-surface);
        color: var(--pg-text);
        font: inherit;
        text-align: left;
        cursor: grab;
      }
      .tray-item:hover {
        border-color: color-mix(in srgb, var(--pg-accent) 40%, transparent);
      }
      .tray-item.armed {
        border-color: var(--pg-accent);
        background: color-mix(in srgb, var(--pg-accent) 10%, var(--pg-surface));
      }
      .tray-item img,
      .tray-item .thumb-placeholder,
      .ghost img,
      .ghost .thumb-placeholder {
        width: 40px;
        height: 40px;
        flex: none;
        border-radius: 50%;
        object-fit: cover;
        background: var(--pg-leaf-soft);
      }
      .tray-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .ghost {
        position: fixed;
        z-index: 10;
        transform: translate(-50%, -50%);
        pointer-events: none;
        filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.3));
      }
      .ghost img,
      .ghost .thumb-placeholder {
        width: 52px;
        height: 52px;
        border: 3px solid var(--pg-accent);
      }

      @media (max-width: 760px) {
        .layout.editing {
          flex-direction: column;
        }
        .layout.editing .stage {
          flex: 1 1 60%;
        }
        .side {
          width: auto;
          flex: 0 1 40%;
          border-left: none;
          border-top: 1px solid var(--pg-divider);
        }
        .seg span {
          display: none;
        }
        .info {
          left: 8px;
          right: 8px;
          top: auto;
          bottom: 8px;
          width: auto;
          display: grid;
          grid-template-columns: 110px 1fr;
        }
        .info-photo {
          aspect-ratio: auto;
        }
        .shape-card {
          grid-template-columns: 1fr;
        }
        .hint {
          bottom: 72px;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .info {
          animation: none;
        }
      }
    `];
	}
}), L("pg-confirm-dialog", class extends F {
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
		return w`
      <dialog @cancel=${() => this._answer(!1)} aria-labelledby="title">
        ${e ? w`
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
		this.styles = [R, h`
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
// src/util/chart.ts
var $ = {
	top: 12,
	right: 16,
	bottom: 28,
	left: 48
};
function _r(e, t = 4) {
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
function vr(e, t, n) {
	let r = [...e].sort((e, t) => e.measured_on.localeCompare(t.measured_on)), i = r.flatMap((e) => [e.height_cm ?? 0, e.width_cm ?? 0]), a = _r(Math.max(0, ...i)), o = a * 4, s = Math.max(1, t - $.left - $.right), c = Math.max(1, n - $.top - $.bottom), l = r.map((e) => ln(e.measured_on).getTime()), u = l[0] ?? 0, d = (l[l.length - 1] ?? 0) - u, f = (e) => $.left + (d === 0 ? s / 2 : (e - u) / d * s), p = (e) => $.top + c - e / o * c, m = (e) => r.flatMap((t, n) => {
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
function yr(e) {
	return e.map((e, t) => `${t ? "L" : "M"}${e.x.toFixed(1)},${e.y.toFixed(1)}`).join(" ");
}
// src/components/growth-chart.ts
var br = 200;
L("pg-growth-chart", class extends F {
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
		return e.length ? T`
      <path class="line ${t}" d=${yr(e)}></path>
      ${e.map((e) => T`<circle class="dot ${t}" cx=${e.x} cy=${e.y} r="4">
          <title>${n} ${G(e.date, this.language)}: ${q(e.value, this.language)}</title>
        </circle>`)}
    ` : D;
	}
	render() {
		let { t: e, language: t } = this, n = vr(this.measurements, this._width, br), r = this._width - $.right, i = br - $.bottom + 18;
		return w`
      <svg
        viewBox="0 0 ${this._width} ${br}"
        width=${this._width}
        height=${br}
        role="img"
        aria-label=${e("chart.label")}
      >
        ${n.ticks.map((e) => T`
            <line class="grid" x1=${$.left} x2=${r} y1=${e.y} y2=${e.y}></line>
            <text class="tick" x=${$.left - 8} y=${e.y + 4} text-anchor="end">
              ${q(e.value, t)}
            </text>`)}
        ${n.first ? T`<text class="tick" x=${$.left} y=${i}>${G(n.first, t)}</text>` : D}
        ${n.last ? T`<text class="tick" x=${r} y=${i} text-anchor="end">${G(n.last, t)}</text>` : D}
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
		this.styles = h`
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
var xr = [
	"development",
	"problem",
	"flowering",
	"harvest"
];
function Sr(e, t) {
	return xr.includes(e) ? t(`tag.${e}`) : e;
}
function Cr(e, t) {
	return e.includes(t) ? e.filter((e) => e !== t) : [...e, t];
}
L("pg-photo-viewer", class extends F {
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
			this._error = P(e);
		} finally {
			this._busy = !1;
		}
	}
	_save() {
		let e = this._photo;
		return e ? this._run(() => ot(this.hass, e.id, {
			tags: this._tags,
			note: this._note
		})) : Promise.resolve();
	}
	_setCover() {
		let e = this._photo;
		return e ? this._run(async () => {
			await Qe(this.hass, this.plantId, e.id), this.coverId = e.id;
		}) : Promise.resolve();
	}
	async _delete() {
		let e = this._photo, t = this.renderRoot.querySelector("pg-confirm-dialog");
		e && t && await t.ask(this.t("viewer.delete_confirm"), G(e.taken_at, this.language), this.t("common.delete")) && await this._run(() => st(this.hass, e.id));
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
		let { t: n } = this, r = this._photo, a = this.photos.length > 1, s = r?.id === this.coverId, l = this._tags.filter((e) => !xr.includes(e));
		return w`
      <dialog @keydown=${this._onKey} aria-label=${n("detail.photos")}>
        ${r ? w`
                <div class="layout">
                  <div class="stage">
                    <img
                      src=${r.urls.medium}
                      srcset="${r.urls.medium} 1024w, ${r.urls.original} 2560w"
                      sizes="(max-width: 900px) 100vw, 70vw"
                      alt=${n("viewer.taken", { date: G(r.taken_at, this.language) })}
                    />
                    ${a ? w`
                            <button
                              class="icon-button nav prev"
                              @click=${() => this._show(this._index - 1)}
                              aria-label=${n("viewer.previous")}
                            >
                              ${I("M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z")}
                            </button>
                            <button
                              class="icon-button nav next"
                              @click=${() => this._show(this._index + 1)}
                              aria-label=${n("viewer.next")}
                            >
                              ${I("M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z")}
                            </button>
                            <span class="counter">${this._index + 1} / ${this.photos.length}</span>
                          ` : D}
                  </div>
                  <aside>
                    <div class="aside-header">
                      <h2>
                        ${n("viewer.taken", { date: G(r.taken_at, this.language) })}
                      </h2>
                      <button
                        class="icon-button"
                        @click=${this.close}
                        aria-label=${n("common.close")}
                      >
                        ${I(e)}
                      </button>
                    </div>
                    <div class="field">
                      <span>${n("viewer.tags")}</span>
                      <div class="chips">
                        ${xr.map((e) => w`<button
                              class="chip"
                              aria-pressed=${this._tags.includes(e)}
                              @click=${() => this._tags = Cr(this._tags, e)}
                            >
                              ${Sr(e, n)}
                            </button>`)}
                        ${l.map((t) => w`<button
                              class="chip selected"
                              @click=${() => this._tags = Cr(this._tags, t)}
                              aria-label="${t} ✕"
                            >
                              ${t} ${I(e)}
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
                          ${I(o)}
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
                    ${this._dirty ? w`<button class="button" ?disabled=${this._busy} @click=${this._save}>
                            ${n("common.save")}
                          </button>` : D}
                    ${this._error ? w`<p class="error-text" role="alert">${this._error}</p>` : D}
                    <div class="actions">
                      <button
                        class="button secondary"
                        ?disabled=${this._busy || s}
                        @click=${this._setCover}
                      >
                        ${I(s ? c : "M12,15.39L8.24,17.66L9.23,13.38L5.91,10.5L10.29,10.13L12,6.09L13.71,10.13L18.09,10.5L14.77,13.38L15.76,17.66M22,9.24L14.81,8.63L12,2L9.19,8.63L2,9.24L7.45,13.97L5.82,21L12,17.27L18.18,21L16.54,13.97L22,9.24Z")}
                        ${n(s ? "viewer.is_cover" : "viewer.set_cover")}
                      </button>
                      <a
                        class="button text"
                        href=${r.urls.original}
                        target="_blank"
                        rel="noopener"
                      >
                        ${I(i)} ${n("viewer.open_original")}
                      </a>
                      <button
                        class="button text danger"
                        ?disabled=${this._busy}
                        @click=${this._delete}
                      >
                        ${I(t)} ${n("viewer.delete")}
                      </button>
                    </div>
                  </aside>
                </div>
              ` : D}
      </dialog>
      <pg-confirm-dialog .hass=${this.hass}></pg-confirm-dialog>
    `;
	}
	static {
		this.styles = [R, h`
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
// src/views/plant-detail.ts
function wr(e) {
	let t = [];
	for (let n of e) {
		let e = dn(n.taken_at), r = t[t.length - 1];
		r?.key === e ? r.photos.push(n) : t.push({
			key: e,
			photos: [n]
		});
	}
	return t;
}
L("pg-plant-detail", class extends F {
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
		}, this.prefix = "/plant-garden", this._error = "", this._notFound = !1, this._uploading = "", this._uploadErrors = [], this._dragging = !1, this._mDate = W(), this._mHeight = "", this._mWidth = "", this._mError = "";
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
			let t = await Je(this.hass, e);
			if (e !== this.plantId) return;
			this._detail = t, this._error = "", this._loadedAt = Date.now();
		} catch (e) {
			e.code === "not_found" ? this._notFound = !0 : this._error = P(e);
		}
	}
	_edit() {
		let e = this._detail?.plant;
		e && this.renderRoot.querySelector("pg-plant-form")?.open(e);
	}
	async _delete() {
		let e = this._detail?.plant, t = this.renderRoot.querySelector("pg-confirm-dialog");
		if (e && t && await t.ask(this.t("detail.delete_title", { name: e.name }), this.t("detail.delete_body"), this.t("common.delete"))) try {
			await Ze(this.hass, e.id), this.store.refresh(), z(this.prefix, { replace: !0 });
		} catch (e) {
			this._error = P(e);
		}
	}
	_pickFiles() {
		this.renderRoot.querySelector("#file-input")?.click();
	}
	async _upload(e) {
		let t = e.filter((e) => e.type.startsWith("image/") || e.type === "");
		if (!t.length || this._uploading) return;
		this._uploadErrors = [];
		let n = await rr(this.hass, this.plantId, t, this.t, (e, t) => {
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
			await ct(this.hass, this.plantId, {
				measured_on: this._mDate || W(),
				height_cm: t,
				width_cm: n
			}), this._mHeight = "", this._mWidth = "", this._mError = "", await this._load();
		} catch (e) {
			this._mError = P(e);
		}
	}
	async _deleteMeasurement(e) {
		try {
			await lt(this.hass, e), await this._load();
		} catch (e) {
			this._mError = P(e);
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
				value: fn(e.age_months_now, t),
				source: r("age") ?? r("planted_on")
			},
			e.planted_on ? {
				label: "field.planted_on",
				value: G(e.planted_on, n),
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
				value: t("detail.frost_to", { temp: K(e.min_temperature_c, n) }),
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
		if (!e) return D;
		let { t } = this, n = e.source === "ai" ? e.confidence === null ? t("source.ai") : t("source.ai_confidence", { confidence: Math.round(e.confidence * 100) }) : t(`source.${e.source}`), r = e.source === "user" ? "M2 17V20H10V18.11H3.9V17C3.9 16.36 7.03 14.9 10 14.9C10.96 14.91 11.91 15.04 12.83 15.28L14.35 13.76C12.95 13.29 11.5 13.03 10 13C7.33 13 2 14.33 2 17M10 4C7.79 4 6 5.79 6 8S7.79 12 10 12 14 10.21 14 8 12.21 4 10 4M10 10C8.9 10 8 9.11 8 8S8.9 6 10 6 12 6.9 12 8 11.11 10 10 10M21.7 13.35L20.7 14.35L18.65 12.35L19.65 11.35C19.86 11.14 20.21 11.14 20.42 11.35L21.7 12.63C21.91 12.84 21.91 13.19 21.7 13.4M12 18.94L18.06 12.88L20.11 14.88L14.11 20.95H12V18.94" : "M9 4L11.5 9.5L17 12L11.5 14.5L9 20L6.5 14.5L1 12L6.5 9.5L9 4M9 8.83L8 11L5.83 12L8 13L9 15.17L10 13L12.17 12L10 11L9 8.83M19 9L17.74 6.26L15 5L17.74 3.75L19 1L20.25 3.75L23 5L20.25 6.26L19 9M19 23L17.74 20.26L15 19L17.74 17.75L19 15L20.25 17.75L23 19L20.25 20.26L19 23Z";
		return w`<span class="source source-${e.source}" title=${n}
      >${I(r, n)}</span
    >`;
	}
	render() {
		let { t: e } = this;
		if (this._notFound) return w`<section class="card message">
        <p>${e("detail.not_found")}</p>
        <button class="button" @click=${() => z(this.prefix, { replace: !0 })}>
          ${e("detail.back_to_list")}
        </button>
      </section>`;
		if (!this._detail) return this._error ? w`<p class="error-text" role="alert">${this._error}</p>` : w`<p class="muted loading">${e("panel.loading")}</p>`;
		let { plant: r, photos: i, measurements: o } = this._detail, c = r.cover, l = [r.scientific_name, r.variety && `'${r.variety}'`].filter(Boolean).join(" ");
		return w`
      ${this._error ? w`<p class="error-text" role="alert">${this._error}</p>` : D}
      <section class="card hero">
        <button
          class="cover"
          ?disabled=${!c}
          @click=${() => {
			let e = i.find((e) => e.id === c?.id);
			e && this._openPhoto(e);
		}}
          aria-label=${e("detail.cover")}
        >
          ${c ? w`<img src=${c.urls.medium} alt="" />` : w`<span class="placeholder">${I(s)}</span>`}
        </button>
        <div class="summary">
          <div class="title-row">
            <h2>${r.name}</h2>
            <span class="status status-${r.status}">${e(`status.${r.status}`)}</span>
          </div>
          ${l ? w`<p class="latin">${l}</p>` : D}
          ${r.family ? w`<p class="muted family">${r.family}</p>` : D}
          ${r.tags.length ? w`<div class="chips">
                  ${r.tags.map((e) => w`<span class="chip static">${e}</span>`)}
                </div>` : D}
          <dl class="facts">
            ${this._facts(r).map((t) => w`<div>
                  <dt>${e(t.label)}</dt>
                  <dd>${t.value} ${this._sourceMark(t.source)}</dd>
                </div>`)}
          </dl>
          <div class="actions">
            <button class="button" @click=${this._pickFiles} ?disabled=${!!this._uploading}>
              ${I(n)} ${e("detail.add_photos")}
            </button>
            <button class="button secondary" @click=${this._edit}>
              ${I(a)} ${e("detail.edit")}
            </button>
            ${r.position ? w`<button
                    class="button secondary"
                    @click=${() => z(`${this.prefix}/plan/${r.id}`)}
                  >
                    ${I("M12 4C14.2 4 16 5.8 16 8C16 10.1 13.9 13.5 12 15.9C10.1 13.4 8 10.1 8 8C8 5.8 9.8 4 12 4M12 2C8.7 2 6 4.7 6 8C6 12.5 12 19 12 19S18 12.4 18 8C18 4.7 15.3 2 12 2M12 6C10.9 6 10 6.9 10 8S10.9 10 12 10 14 9.1 14 8 13.1 6 12 6M20 19C20 21.2 16.4 23 12 23S4 21.2 4 19C4 17.7 5.2 16.6 7.1 15.8L7.7 16.7C6.7 17.2 6 17.8 6 18.5C6 19.9 8.7 21 12 21S18 19.9 18 18.5C18 17.8 17.3 17.2 16.2 16.7L16.8 15.8C18.8 16.6 20 17.7 20 19Z")} ${e("plan.show_on_plan")}
                  </button>` : D}
            <button class="button text danger" @click=${this._delete}>
              ${I(t)} ${e("detail.delete")}
            </button>
          </div>
        </div>
      </section>

      ${r.notes ? w`<section class="card block">
              <h3>${e("detail.notes")}</h3>
              <p class="notes">${r.notes}</p>
            </section>` : D}

      <section class="card block">
        <h3>${e("detail.growth")}</h3>
        ${o.length ? w`<pg-growth-chart
                .hass=${this.hass}
                .measurements=${o}
              ></pg-growth-chart>` : w`<p class="muted">${e("detail.no_measurements")}</p>`}
        ${o.length ? this._renderMeasurementList() : D}
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
          ${this._mError ? w`<p class="error-text" role="alert">${this._mError}</p>` : D}
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
            ${I(n)} ${e("detail.add_photos")}
          </button>
        </div>
        ${this._uploading ? w`<p class="muted" aria-live="polite">${this._uploading}</p>` : D}
        ${this._uploadErrors.length ? w`<ul class="error-text" role="alert">
                ${this._uploadErrors.map((e) => w`<li>${e}</li>`)}
              </ul>` : D}
        ${i.length ? this._renderTimeline(i, c?.id ?? null) : w`<p class="muted">${e("detail.no_photos")}</p>`}
        ${this._dragging ? w`<div class="drop-hint">${e("detail.drop_photos")}</div>` : D}
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
        .photos=${i}
        .plantId=${r.id}
        .coverId=${c?.id ?? null}
        @photos-changed=${() => this._load()}
      ></pg-photo-viewer>
      <pg-confirm-dialog .hass=${this.hass}></pg-confirm-dialog>
    `;
	}
	_renderMeasurementList() {
		let { t: e, language: n } = this, r = [...this._detail?.measurements ?? []].reverse();
		return w`<table>
      <thead>
        <tr>
          <th>${e("detail.measured_on")}</th>
          <th>${e("field.height")}</th>
          <th>${e("field.width")}</th>
          <th><span class="sr-only">${e("common.delete")}</span></th>
        </tr>
      </thead>
      <tbody>
        ${r.map((r) => w`<tr>
              <td>${G(r.measured_on, n)}</td>
              <td>${q(r.height_cm, n) || "–"}</td>
              <td>${q(r.width_cm, n) || "–"}</td>
              <td class="row-action">
                <button
                  class="icon-button"
                  @click=${() => this._deleteMeasurement(r.id)}
                  aria-label=${e("detail.delete_measurement")}
                  title=${e("detail.delete_measurement")}
                >
                  ${I(t)}
                </button>
              </td>
            </tr>`)}
      </tbody>
    </table>`;
	}
	_renderTimeline(e, t) {
		let { t: n, language: r } = this;
		return wr(e).map((e) => w`<div class="month">
          <h4>${un(e.photos[0]?.taken_at ?? "", r)}</h4>
          <div class="thumbs">
            ${e.photos.map((e) => w`<button
                  class="thumb"
                  @click=${() => this._openPhoto(e)}
                  aria-label=${n("viewer.taken", { date: G(e.taken_at, r) })}
                >
                  <img src=${e.urls.thumb} alt="" loading="lazy" decoding="async" />
                  ${e.id === t ? w`<span class="star">${I(c)}</span>` : D}
                  ${e.tags.length ? w`<span class="tags">
                          ${e.tags.map((e) => w`<span class="tag ${e === "problem" ? "problem" : ""}"
                                >${Sr(e, n)}</span
                              >`)}
                        </span>` : D}
                </button>`)}
          </div>
        </div>`);
	}
	static {
		this.styles = [R, h`
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
// src/panel.ts
var Tr = 9e5;
function Er(e) {
	let t = e ?? "", n = /^\/plants\/([0-9A-Za-z]+)\/?$/.exec(t);
	return n?.[1] ? {
		name: "plant",
		plantId: n[1]
	} : /^\/plants\/?$/.test(t) ? { name: "plants" } : {
		name: "plan",
		focusPlantId: /^\/plan\/([0-9A-Za-z]+)\/?$/.exec(t)?.[1] ?? null
	};
}
var Dr = class extends M {
	constructor(...e) {
		super(...e), this._store = new _t(() => this.hass), this._started = !1, this._localize = mt("en"), this._language = "", this._lastList = "plan", this._onStoreChange = () => this.requestUpdate(), this._refreshIfStale = () => {
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
		super.connectedCallback(), this._store.addEventListener("change", this._onStoreChange), document.addEventListener("visibilitychange", this._refreshIfStale), this._freshnessTimer = setInterval(this._refreshIfStale, Tr), this.hass && this._start();
	}
	disconnectedCallback() {
		super.disconnectedCallback(), this._store.removeEventListener("change", this._onStoreChange), document.removeEventListener("visibilitychange", this._refreshIfStale), clearInterval(this._freshnessTimer), this._store.disconnect(), this._started = !1;
	}
	willUpdate(e) {
		if (e.has("route")) {
			let e = Er(this.route?.path);
			e.name !== "plant" && (this._lastList = e.name);
		}
		if (!e.has("hass") || !this.hass) return;
		let t = this.hass.locale?.language ?? this.hass.language;
		t !== this._language && (this._language = t, this._localize = mt(t)), this.toggleAttribute("dark", !!this.hass.themes?.darkMode), !this._started && this.isConnected && this._start();
	}
	_start() {
		this._started = !0, this._loadInfo(), this._store.connect();
	}
	async _loadInfo() {
		try {
			this._info = await Ke(this.hass), this._infoError = void 0;
		} catch (e) {
			this._infoError = P(e);
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
		let e = this._localize, t = Er(this.route?.path), n = this._info?.garden_name ?? this.panel?.title ?? "Plant Garden", r = t.name === "plant" ? this._store.getPlant(t.plantId)?.name ?? n : "";
		return w`
      <header class="toolbar">
        ${t.name === "plant" ? w`<button
                class="icon-button"
                @click=${() => z(this._lastList === "plants" ? `${this._prefix}/plants` : this._prefix)}
                aria-label=${e("panel.back")}
                title=${e("panel.back")}
              >
                ${I("M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z")}
              </button>` : this.narrow ? w`<button
                  class="icon-button"
                  @click=${this._toggleSidebar}
                  aria-label=${e("panel.open_sidebar")}
                  title=${e("panel.open_sidebar")}
                >
                  ${I("M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z")}
                </button>` : D}
        <h1>${t.name === "plant" ? r : n}</h1>
        ${t.name === "plant" ? D : w`<nav class="tabs">
                <a
                  href=${this._prefix}
                  aria-current=${t.name === "plan" ? "page" : "false"}
                  @click=${(e) => this._go(e, this._prefix)}
                  >${e("nav.plan")}</a
                >
                <a
                  href="${this._prefix}/plants"
                  aria-current=${t.name === "plants" ? "page" : "false"}
                  @click=${(e) => this._go(e, `${this._prefix}/plants`)}
                  >${e("nav.plants")}</a
                >
              </nav>`}
      </header>
      <main class=${t.name === "plan" ? "full" : ""}>
        ${this._renderBody(e, t, n)}
      </main>
    `;
	}
	_go(e, t) {
		e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || (e.preventDefault(), z(t));
	}
	_renderBody(e, t, n) {
		let r = this._infoError ?? (this._store.loaded ? void 0 : this._store.error);
		if (r) return w`
        <section class="card state" role="alert">
          ${I("M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z")}
          <h2>${e("panel.error_title")}</h2>
          <p class="muted">${r}</p>
          <p class="muted">${e("panel.error_hint")}</p>
          <button class="button" @click=${this._retry}>
            ${I("M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z")} ${e("panel.retry")}
          </button>
        </section>
      `;
		if (!this._store.loaded || !this._info) return w`<p class="muted loading" aria-live="polite">${e("panel.loading")}</p>`;
		switch (t.name) {
			case "plant": return w`<pg-plant-detail
          .hass=${this.hass}
          .store=${this._store}
          .plantId=${t.plantId}
          .prefix=${this._prefix}
        ></pg-plant-detail>`;
			case "plants": return w`<pg-plants-view
          .hass=${this.hass}
          .store=${this._store}
          .gardenName=${n}
          .prefix=${this._prefix}
        ></pg-plants-view>`;
			default: return w`<pg-garden-view
          .hass=${this.hass}
          .store=${this._store}
          .prefix=${this._prefix}
          .focusPlantId=${t.focusPlantId}
        ></pg-garden-view>`;
		}
	}
	static {
		this.styles = [
			vt,
			R,
			h`
      :host {
        display: flex;
        flex-direction: column;
        min-height: 100%;
        height: 100%;
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
        flex: none;
        height: var(--header-height, 56px);
        padding: 0 12px;
        background: var(--app-header-background-color, var(--pg-accent));
        color: var(--app-header-text-color, #fff);
        border-bottom: var(--app-header-border-bottom, none);
      }
      .toolbar h1 {
        margin: 0 12px 0 8px;
        font-size: 20px;
        font-weight: 400;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tabs {
        display: flex;
        align-self: stretch;
        margin-left: auto;
      }
      .tabs a {
        display: flex;
        align-items: center;
        padding: 0 14px;
        color: inherit;
        text-decoration: none;
        opacity: 0.75;
        border-bottom: 3px solid transparent;
        font-weight: 500;
        font-size: 14px;
      }
      .tabs a[aria-current="page"] {
        opacity: 1;
        border-bottom-color: currentColor;
      }
      .tabs a:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: -4px;
      }
      main {
        flex: 1;
        width: 100%;
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px 16px 32px;
        box-sizing: border-box;
      }
      main.full {
        max-width: none;
        padding: 0;
        min-height: 0;
        height: calc(100vh - var(--header-height, 56px));
        height: calc(100dvh - var(--header-height, 56px));
      }
      .loading {
        text-align: center;
        padding: 48px 0;
      }
      .state {
        margin: 20px 16px;
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
      @media (max-width: 520px) {
        .toolbar h1 {
          font-size: 18px;
          margin-right: 4px;
        }
        .tabs a {
          padding: 0 10px;
        }
      }
    `
		];
	}
};
// src/main.ts
customElements.get("plant-garden-panel") || customElements.define("plant-garden-panel", Dr);
