Inassembly = {
  fetch: async (url, postData) => {
    if (postData) return await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.statestringify(postData) }).then((response) => response.json());
    return await fetch(url).then((response) => response.json());
  },
  fetchCache: {},
  fetchAndMount: (url, parentDom = document.body, cacheProfile = "NONE") => {
    let profile = cacheProfile.toUpperCase();
    if (profile !== "NONE")
      if (profile == "PAGE" && Inassembly.fetchCache[url]) return new Inassembly.Component(Inassembly.fetchCache[url]).mountDom(parentDom);
      else if (profile == "SESSION" && sessionStorage["fetchCache:" + url]) return new Inassembly.Component(JSON.parse(sessionStorage["fetchCache:" + url])).mountDom(parentDom);
      else if (profile == "LOCAL" && localStorage["fetchCache:" + url]) return new Inassembly.Component(JSON.parse(localStorage["fetchCache:" + url])).mountDom(parentDom);
    Inassembly.fetch("/Inassembly/" + url).then((data) => {
      if (profile == "NONE") {
        if (Inassembly.fetchCache[url]) delete Inassembly.fetchCache[url];
        else if (sessionStorage["fetchCache:" + url]) delete sessionStorage["fetchCache:" + url];
        else if (localStorage["fetchCache:" + url]) delete localStorage["fetchCache:" + url];
      } else if (profile == "PAGE") Inassembly.fetchCache[url] = data;
      else if (profile == "SESSION") sessionStorage.setItem("fetchCache:" + url, JSON.stringify(data));
      else if (profile == "LOCAL") localStorage.setItem("fetchCache:" + url, JSON.stringify(data));
      new Inassembly.Component(data).mountDom(parentDom);
    });
  },
  Component: class {
    constructor(args, parent) {
      this.template;
      this.initializers = [];
      this.autoUpdate = true;
      this.parent = parent || null;
      for (let i = 0; i < args.length; i++) {
        if (/^\w+$/.test(args[i])) {
          this.template = args.slice(i);
          break;
        } else this.initializers.push(args[i]);
      }
      this.state = {};
      this.onMount = () => {};
      this.onNode = () => {};
      for (let i of this.initializers) new Function(i).bind(this)();
      this.state = new Proxy(this.state, {
        set: (obj, key, value) => {
          obj[key] = value;
          if (this.autoUpdate) this.updateDom();
          return true;
        },
      });
      this.node = new Inassembly.Node(this, this.template);
      this.onNode(this.node);
    }

    mountDom(parentDom) {
      parentDom.appendChild(this.node.createDom());
    }

    updateDom() {
      let newVirtualNode = new Inassembly.Node(this, this.template);
      this.node.updateDom(newVirtualNode);
    }

    remountDom() {
      let old = this.node.current;
      this.parentNode.current.replaceChild(this.node.createDom(), old);
    }

    createDom() {
      let dom = this.node.createDom();
      this.onMount(dom);
      return dom;
    }
  },
  Node: class {
    constructor(component, args) {
      this.component = component;
      let isNotObject = (e) => ["string", "boolean", "number"].includes(typeof e);
      if (args instanceof Array) {
        this.type = "element";
        this.tagName = args[0];
        let attributes = args[1] instanceof Array || isNotObject(args[1]) ? {} : args[1];
        this.attributes = {};
        for (let key in attributes) this.attributes[key] = Inassembly.Node.textParser(attributes[key], this.component);
        this.childNodes = [];
        let children = args[1] instanceof Array || isNotObject(args[1]) ? args.slice(1) : args.slice(2);
        for (let child of children) {
          if (isNotObject(child)) this.appendChild(new Inassembly.Node(component, String(child)));
          else if (child instanceof Array) {
            if (/^\w+$/.test(child[0])) this.appendChild(new Inassembly.Node(component, child));
            else if (child.length == 1) {
              let returned = new Function("self", ...child).bind(this, component)();
              if (isNotObject(returned)) this.appendChild(new Inassembly.Node(component, String(returned)));
              else if (returned) this.appendChild(new Inassembly.Node(component, returned));
              else this.appendChild(new Inassembly.Node(component)); // void
            } else this.appendChild(new Inassembly.Component(child, this.component));
          }
        }
      } else if (isNotObject(args)) {
        this.type = "text";
        this.data = Inassembly.Node.textParser(args, this.component);
      } else this.type = "void";
    }

    appendChild() {
      for (let node of arguments) node.parentNode = this;
      this.childNodes.push(...arguments);
    }
    createDom() {
      switch (this.type) {
        case "element": {
          this.current = document.createElement(this.tagName);
          for (let key in this.attributes) this.current.setAttribute(key, this.attributes[key]);
          for (let node of this.childNodes) this.current.appendChild(node.createDom());
          break;
        }
        case "text": {
          this.current = document.createTextNode(this.data);
          break;
        }
        default: {
          this.current = document.createTextNode("");
          break;
        }
      }
      this.current.vnode = this;
      this.current.self = this.component;
      return this.current;
    }

    cloneAndReplace(updatedVirtualNode) {
      let oldDom = this.current;
      for (let key in this) delete this[key];
      for (let key in updatedVirtualNode) this[key] = updatedVirtualNode[key];
      oldDom.parentNode.replaceChild(this.createDom(), oldDom);
      console.log(oldDom, this.current);
    }

    updateDom(updatedVirtualNode) {
      if (this.type !== updatedVirtualNode.type) this.cloneAndReplace(updatedVirtualNode);
      if (this.type == "element") {
        if (this.childNodes.length !== updatedVirtualNode.childNodes.length) {
          this.cloneAndReplace(updatedVirtualNode);
        } else {
          for (let key in updatedVirtualNode.attributes)
            if (this.attributes[key] !== updatedVirtualNode.attributes[key]) {
              this.current.setAttribute(key, updatedVirtualNode.attributes[key]);
              this.attributes[key] = updatedVirtualNode.attributes[key];
            }
          for (let i = 0; i < this.childNodes.length; i++) {
            this.childNodes[i].updateDom(updatedVirtualNode.childNodes[i]);
          }
        }
      } else if (this.type == "text" && this.data !== updatedVirtualNode.data) {
        this.current.data = updatedVirtualNode.data;
        this.data = updatedVirtualNode.data;
      }
    }

    static textParser(text, component) {
      return text.replace(/_(\w+)_/g, (_, m) => component.state[m]).replace(/\(\((\w+)\)\)/, (_, m) => component.methods[m]());
    }
  },

  // used in javascript
  createElement: (...args) => args,
  initializers: {
    store: (component) => {
      if (component.node.attributes.saveAs) {
        Inassembly.data.store[component.attr.saveAs] = component.inner[0];
        component.nobuild = true;
      } else if (component.attr.loadFrom) {
        let inner = Inassembly.copy(component.inner);
        component.inherit(Inassembly.data.store[component.attr.loadFrom]);
        component.onbuild = () => {
          let e = component.dom.querySelector(".super");
          if (e) e.append(component.build({ tag: "div", inner }));
        };
      }
    },
    link: (component) => {
      component.onNode = (node) => {
        let attributes = node.attributes;
        attributes.href = attributes.to;
        attributes.onclick =
          " if (!(location.pathname).startsWith(this.getAttribute('to'))) {history.pushState({}, null, this.attributes.to.value); document.documentElement.scrollTop = 0 }; return false";
      };
    },
    route: (component) => {
      component.onNode = (node) => {
        if (node.attributes.exact) console.log("exact exists");
        let childNodes = node.childNodes;

        let verif = node.attributes.exactPath ? () => location.pathname == node.attributes.exactPath : () => location.pathname.startsWith(node.attributes.path);
        if (verif()) {
          if (!node.childNodes[0]) node.childNodes = childNodes;
        } else if (node.childNodes[0]) node.childNodes = [];
        window.addEventListener("locationchange", () => {
          if (verif()) {
            if (!node.childNodes[0]) {
              node.childNodes = childNodes;
              component.remountDom();
            }
          } else if (node.childNodes[0]) {
            node.childNodes = [];
            component.remountDom();
          }
        });
      };
    },
    // route: (component) => {},
    fetch: (component) => {
      component.onMount = () => {
        Inassembly.fetchAndMount(component.node.attributes.url, component.node.current, component.node.attributes.cache);
      };
    },
  },
  data: {
    store: {},
  },
};

history.pushState = ((f) =>
  function pushState() {
    var ret = f.apply(this, arguments);
    window.dispatchEvent(new Event("locationchange"));
    return ret;
  })(history.pushState);

history.replaceState = ((f) =>
  function replaceState() {
    var ret = f.apply(this, arguments);
    window.dispatchEvent(new Event("locationchange"));
    return ret;
  })(history.replaceState);

window.addEventListener("popstate", () => {
  window.dispatchEvent(new Event("locationchange"));
});
