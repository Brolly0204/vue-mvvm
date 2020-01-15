const compileUtil = {
  getVal(vm, expr) {
    expr = expr.trim()
    const value = expr.split('.').reduce((data, name) => data[name], vm.$data)
    console.log('value', value)
    return value
  },
  setVal(vm, expr, value) {
    const attrs = expr.split('.')
    attrs.reduce((data, name, index, arr) => {
      if (index === arr.length - 1) {
        data[name] = value
      }
      return data[name]
    }, vm.$data)
  },
  getContentValue(vm, expr) {
    return expr.replace(/\{\{(.+?)\}\}/g, (...args) => this.getVal(vm, args[1]))
  },
  // v-model
  model(node, expr, vm) {
    const updater = this.updater.modelUpdater
    /* eslint-disable no-new */
    new Watcher(vm, expr, (newVal) => {
      updater(node, newVal)
    })
    // 双向绑定
    node.addEventListener('input', (e) => {
      const { value } = e.target
      this.setVal(vm, expr, value)
    })
    const value = this.getVal(vm, expr)
    updater(node, value)
  },
  // v-on
  on(node, expr, vm, eventName) {
    node.addEventListener(eventName, (e) => {
      console.log(vm[expr])
      vm[expr].call(vm, e)
    })
  },
  html(node, expr, vm) {
    const updater = this.updater.htmlUpdater
    /* eslint-disable no-new */
    new Watcher(vm, expr, (newVal) => {
      updater(node, newVal)
    })
    const value = this.getVal(vm, expr)
    updater(node, value)
  },
  text(node, expr, vm) {
    const updater = this.updater.textUpdater
    const content = expr.replace(/\{\{(.+?)\}\}/g, (...args) => {
      new Watcher(vm, args[1], () => {
        updater(node, this.getContentValue(vm, expr))
      })
      return this.getVal(vm, args[1])
    })
    updater(node, content)
  },
  updater: {
    modelUpdater(node, value) {
      node.value = value
    },
    // htmlUpdater(node, value) {},
    textUpdater(node, value) {
      node.textContent = value
    },
    htmlUpdater(node, value) {
      node.innerHTML = value
    },
  }
}

// 订阅者
class Dep {
  constructor() {
    this.subs = []
  }

  addSub(watcher) {
    this.subs.push(watcher)
  }

  notify() {
    console.log('subs', this.subs)
    this.subs.forEach((watcher) => watcher.update())
  }
}

// 观察者（发布订阅）
class Watcher {
  constructor(vm, expr, cb) {
    this.vm = vm
    this.expr = expr.trim()
    this.cb = cb
    // 缓存老值
    this.oldValue = this.get()
  }

  get() {
    Dep.target = this
    const value = compileUtil.getVal(this.vm, this.expr)
    Dep.target = null
    return value
  }

  update() {
    const newVal = compileUtil.getVal(this.vm, this.expr)
    if (newVal !== this.oldValue) {
      this.cb(newVal)
    }
  }
}

class Compiler {
  constructor(el, vm) {
    this.el = this.isElementNode(el) ? el : document.querySelector(el)
    const fragment = this.node2fragment(this.el)
    this.vm = vm
    this.compile(fragment)
    this.el.appendChild(fragment)
  }

  isDirective(name) {
    return name.startsWith('v-')
  }

  compileElement(node) {
    const { attributes } = node
    Array.from(attributes).forEach((attr) => {
      const { name, value: expr } = attr
      if (this.isDirective(name)) {
        const [, directive] = name.split('-')
        const [directiveName, eventName] = directive.split(':')
        compileUtil[directiveName](node, expr, this.vm, eventName)
      }
    })
  }

  compileText(node) {
    const content = node.textContent
    if (/\{\{(.+?)\}\}/.test(content)) {
      compileUtil.text(node, content, this.vm)
    }
  }

  compile(node) {
    const { childNodes } = node
    Array.from(childNodes).forEach((child) => {
      if (this.isElementNode(child)) { // 元素节点
        this.compileElement(child)
        this.compile(child)
      } else {
        this.compileText(child)
      }
    })
  }

  node2fragment(node) {
    const fragment = document.createDocumentFragment()
    let firstChild
    while (node.firstChild) {
      firstChild = node.firstChild
      fragment.appendChild(firstChild)
    }
    return fragment
  }

  isElementNode(node) {
    return node.nodeType === 1
  }
}

// 数据响应式
class Observer {
  constructor(data) {
    this.observer(data)
  }

  observer(data) {
    if (!data || typeof data !== 'object') return
    Object.keys(data).forEach((key) => {
      this.defineReactive(data, key, data[key])
    })
  }

  defineReactive(data, key, value) {
    this.observer(value)
    const that = this
    const dep = new Dep()
    Object.defineProperty(data, key, {
      enumerable: true,
      configurable: true,
      get() {
        if (Dep.target) {
          dep.addSub(Dep.target)
        }
        return value
      },
      set(newVal) {
        if (value !== newVal) {
          that.observer(newVal)
          value = newVal
          dep.notify()
        }
      }
    })
  }
}

/* eslint-disable */
class Vue {
  constructor(options = {}) {
    this.$el = options.el
    this.$data = options.data
    const methods = options.methods
    const computed = options.computed
    // 存在元素 模板编译
    if (this.$el) {
      // 数据响应式
      new Observer(this.$data)
      // 计算属性
      Object.keys(computed).forEach((key) => {
        Object.defineProperty(this.$data, key, {
          get() {
            // computed属性方法执行的时候 需要获取vue实例上的属性，从而触发属性的getter函数 添加Watcher
            return computed[key].call(this)
          }
        })
      })

      // 挂载methods
      Object.keys(methods).forEach(key => {
        Object.defineProperty(this, key, {
          get() {
            return methods[key]
          }
        })
      })
      // 把this.$data数据代理到Vue实例上
      this.proxyVm(this.$data)
      // 模板编译
      new Compiler(this.$el, this)
    }
  }
  proxyVm(data) {
    Object.keys(data).forEach((key) => {
      Object.defineProperty(this, key, {
        get() {
          return data[key]
        },
        set(newVal) {
          data[key] = newVal
        }
      })
    })
  }
}
