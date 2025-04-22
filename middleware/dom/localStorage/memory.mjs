class Storage {
    constructor() {
        this.__valuesMap = new Map()
    }

    getItem(key) {
        console.log('in memory getItem');
        return this.__valuesMap.has(key)
            ? String(this.__valuesMap.get(String(key)))
            : null
    }

    setItem(key, val) {
        console.log('in memory set item');
        this.__valuesMap.set(String(key), String(val))
    }

    removeItem(key) {
      this.__valuesMap.delete(key)
    }

    clear() {
      this.__valuesMap.clear()
    }

    key(i) {
        if (!arguments.length) {
            // this is a TypeError implemented on Chrome, Firefox throws Not enough arguments to Storage.key.
            throw new TypeError(
            "Failed to execute 'key' on 'Storage': 1 argument required, but only 0 present.",
            )
        }
        return Array.from(this.__valuesMap.keys())[i]
    }

    get length() {
        return this.__valuesMap.size
    }

    set length(val) {}
}

const getterSetter = instance => ({
    set: function(obj, prop, value) {
        if (Storage.prototype.hasOwnProperty(prop)) {
            instance[prop] = value
        } else {
            instance.setItem(prop, value)
        }
        return true
    },
    get: function(target, name) {
        if (Storage.prototype.hasOwnProperty(name) || name === '__valuesMap') {
            return instance[name]
        }
        if (instance.__valuesMap.has(name)) {
            return instance.getItem(name)
        }
    },
})

export default {
    createStorage: async ( configuration ) => {
        return new Storage();
    }
}

