
function makeTab(title, tab, sel, comp) {
	console.log("makeTab(", title, tab, sel, comp, ")")
	var tabElt = document.createElement("span");
	tabElt.className = "tab clickable" + sel;
	tabElt.dataset.tab = tab;
	tabElt.dataset.tabKey = comp._tabKey;
	tabElt.dataset.tabDefine = true;
	tabElt.textContent = title;
	tabElt.addEventListener("click", e => {
		e.preventDefault();
		e.stopPropagation();
		if (!tabElt.classList.contains("disabled"))
			globalThis.turtleduck.tabSelect(tab, comp._tabKey);
	});
	if (comp._onclosehandler) {
		const tabClose = document.createElement("button");
		tabClose.type = "button";
		tabClose.className = "tab-close";
		tabClose.addEventListener("click", e => {
			e.preventDefault();
			e.stopPropagation();
			if (!tabElt.classList.contains("disabled")) {
				if (comp._onclosehandler(comp, e)) {
					comp.remove();
				}
			}
		});
		tabClose.textContent = "×";
		tabClose.attributes.role = "presentation";
		tabElt.appendChild(tabClose);
	}

	return tabElt;
}
class Component {
	constructor(name, element, tdstate, parent = null) {
		console.log("Component(",name, element, tdstate, parent, ")");
		if (!name)
			name = element.id;
		if(!element.hasAttribute('tab-title'))
			element.setAttribute('tab-title', name);
		console.log("new Component(%o,%o,%o)", name, element, tdstate);
		this.name = name;
		this._element = element;
		this._focusElement = this._findFocusElement(element);
		this._selectedChild = null;
		this._tdstate = tdstate;
		this._tabs = element.querySelector("nav.tabs")
		this._toolbar = element.querySelector("nav.toolbar")
		this._registered = false;
		if (this._tabs) {
			this._insertHere = element.querySelector('[data-insert-here]');
			//element.childNodes.forEach(node => { if (node.dataset && node.dataset.insertHere) this._insertHere = node; });
		}
		this._tab = element.dataset.tab || (this._tabs && (this._tabs.dataset.tab || this._tabs.id)) || null;
		this._tabKey = element.dataset.tabKey;
		this._hasTab = !!this._tab;
		element.tabIndex = -1;
		this.setParent(parent);
		element.addEventListener("focusin", e => this._focusin(e), false);
		element.addEventListener("focusout", e => {
			//console.log("focusout", name, e);
			//element.classList.remove("focused");
			//tdstate.lastFocus = this;
		}, false);
	}

	_focusin(e) {
		this._highlight(true);
		const last = this._tdstate.currentFocus;
		if (this.debug)
			console.log("focusin", this.name, e, "this:", this, "last:", last);
		//console.log("  this:", this);
		//console.log("  current:", last);
		//console.log("  last:", tdstate.lastFocus);
		//console.log("  event:", e);
		if (last !== this) {
			this._tdstate.currentFocus = this;
			this._tdstate.lastFocus = last;
			if (last !== null && last._focusElement !== this._focusElement)
				last._highlight(false);
		}
		e.stopPropagation();
		return false;
	}
	addChild(child) {
		this[child.name] = child;
		if (this._hasTab && this._tabs) {
			const childElt = child._element;
			const dataset = childElt.dataset;
			dataset.tab = this._tab;
			dataset.tabKey = child.name;
			child._tab = this._tab;
			child._tabKey = child.name;
			child._hasTab = true;
			var sel = "";
			/*if (!this._tabs.hasChildNodes()) {
				sel = " selected";
				childElt.style.display = "block";
			} else {
				childElt.style.display = "none";
			}*/
			child._tabElt = makeTab(child._title || dataset.title || child.name,
				this._tab, sel, child)
			this._tabs.appendChild(child._tabElt);
			if (this._insertHere) {
				this._insertHere.parentElement.insertBefore(child._element, this._insertHere);
			} else {
				this._element.appendChild(child._element);
			}
			child._focusElement = child._findFocusElement(child._element);
		}
	}

	addWindowTools() {
		if (this._toolbar && !this._winTools) {
			this._icon = document.createElement("button");
			this._icon.type = "button";
			this._icon.textContent = this.title();
			this._icon.addEventListener('click', e => {
				this.iconified(false);
				this._tdstate.wm.recomputeLayout();
			});
			document.getElementById('iconbox').appendChild(this._icon);
			this._winTools = document.createElement("nav");
			this._winTools.className = "window-tools";
			const minButton = document.createElement("button");
			minButton.type = "button";
			minButton.textContent = "";
			minButton.className = "min-button";
			minButton.addEventListener('click', e => {
				this.iconified(true);
				this._tdstate.wm.recomputeLayout();
			});
			this._winTools.appendChild(minButton);
			const maxButton = document.createElement("button");
			maxButton.type = "button";
			maxButton.textContent = "";
			maxButton.className = "max-button";
			maxButton.addEventListener('click', e => {
				if (this._element.classList.contains("maximized")) {
					this._tdstate.wm.unmaximize(this);
				} else {
					this._tdstate.wm.maximize(this);
				}
			});
			this._winTools.appendChild(maxButton);
			this._toolbar.appendChild(this._winTools);
		}
	}
	addDependent(dep) {
		dep.dataset.tab = this._tab;
		dep.dataset.tabKey = this._tabKey;
		dep.style.display = this._element.style.display;
	}

	onclose(handler) {
		if (this._registered) {
			console.error("onclose() after register():", this.name, this._element);
		}
		this._onclosehandler = handler;
	}

	remove() {
		if (this._tabElt) {
			if (this._tabElt.classList.contains("selected")) {
				console.log("removing selected tab", this._tabElt);
				const next = this._tabElt.nextElementSibling;
				const prev = this._tabElt.previousElementSibling;
				if (next) {
					console.log("next:", next, next.dataset.tabKey);
					globalThis.turtleduck.tabSelect(this._tab, next.dataset.tabKey);
				} else if (prev) {
					console.log("prev:", prev, prev.dataset.tabKey);
					globalThis.turtleduck.tabSelect(this._tab, prev.dataset.tabKey);
				}
			}
			this._tabElt.remove();
		}
		if (this._element) {
			this._element.remove();
		}
		if (this._parent !== null) {
			this._parent[this.name] = undefined;
		}
	}
	setTitle(title) {
		if (this._registered) {
			console.error("setTitle() after register():", this.name, this._element);
		}
		this._title = title;
		this._element.setAttribute('tab-title', title);
	}

	title() {
		return this._title ? this._title : this.name;
	}
	setParent(parent) {
		if (this._registered) {
			console.error("setParent() after register():", this.name, this._element);
		}
		this._parent = parent;
		this._focusElement = this._findFocusElement(this._element);
	}

	iconified(enable) {
		if (this._icon) {
			const wasEnabled = this.isIconified();
			if (enable) {
				this._icon.classList.add('iconified');
				this._icon.classList.remove('maximized');
				this._element.classList.add("iconified");
				this._element.classList.remove("maximized");
			}
			else {
				this._icon.classList.remove('iconified');
				this._element.classList.remove("iconified");
			}
			return enable != wasEnabled;
		} else if (this._parent) {
			return this._parent.iconified(enable);
		} else {
			return false;
		}
	}

	maximized(enable) {
		if (this._icon) {
			const wasEnabled = this.isMaximized();
			if (enable) {
				this._icon.classList.add('maximized');
				this._element.classList.add("maximized");
				this._icon.classList.remove('iconified');
				this._element.classList.remove("iconified");
			}
			else {
				this._icon.classList.remove('maximized');
				this._element.classList.remove("maximized");
			}
			return enable != wasEnabled;
		} else if (this._parent) {
			return this._parent.maximized(enable);
		} else {
			return false;
		}
	}

	isIconified() {
		if (this._icon) {
			return this._element.classList.contains("iconified");
		} else if (this._parent) {
			return this._parent.isIconified();
		}
	}

	isMaximized() {
		if (this._icon) {
			return this._element.classList.contains("maximized");
		} else if (this._parent) {
			return this._parent.isMaximized();
		}
	}
	_findFocusElement(elt) {
		if (elt.classList.contains('focusable')) {
			return elt;
		} else if (elt.parentElement !== null) {
			return this._findFocusElement(elt.parentElement);
		} else {
			return null;
		}
	}

	_highlight(enable) {
		if (this._focusElement !== null) {
			if (enable)
				this._focusElement.classList.add("focused");
			else
				this._focusElement.classList.remove("focused");
		}
	}
	element() {
		return this._element;
	}

	current() {
		if (this._selectedChild !== null) {
			return this._selectedChild.current();
		} else {
			return this;
		}
	}

	select() {
		if (this._parent !== null) {
			this._parent._selectedChild = this;
			if (this._hasTab) {
				this._tdstate.tabSelect(this._tab, this._tabKey);
			}
		}
	}

	focus() {
		console.log("component.focus", this);
		if (this._selectedChild !== null) {
			console.log(" => ", this._selectedChild);
			return this._selectedChild.focus();
		} else {
			console.log(" => ", this._element);
			this.select();
			return this._element.focus();
		}
	}

	register() {
		this._registered = true;
		if (!this._parent) {
			this._tdstate[this.name] = this;
		} else {
			this._parent.addChild(this);
		}
	}
}


export { Component };
