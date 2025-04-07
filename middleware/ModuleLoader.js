import * as vm from 'node:vm'
import * as path from "jsr:@std/path";
console.log( vm );
const SourceTextModule = vm.SourceTextModule;

const __dirname = path.dirname(new URL(import.meta.url).pathname)
const ModuleLoader = async (dom) => {
    class Worker extends dom.window.EventTarget {
        constructor(url){
            super()
            console.log('from worker', url)
            window.fetch(url).then(resp => resp.text())
            .then(code => {
                console.log(code)
            })
            .catch(e => console.error(e))
        }
        postMessage(data){
            console.log('postmessage', data)
            this.emit('message', data)
        }
        terminate(){
            console.log('terminating')
        }
    }
    class MediaQueryList extends dom.window.EventTarget {
        #query
        constructor(query){
            super()
            this.#query = query
        }
        get matches(){
            return true
        }
        get media(){
            return this.#query
        }
    }
    dom.window.matchMedia = query => {
        return new MediaQueryList(query)
    }
    dom.window.Worker = Worker
    const doc = dom.window.document
    const url = dom.window.location.href
    let modules = {}
    for await (let script of Array.from(doc.querySelectorAll('script[type="module"]'))){
        let app = new SourceTextModule(`${script.textContent}`, {
            context: dom.getInternalVMContext()
        })
        try{
            await app.link(async (specifier, referencingModule)=>{
                let parts = specifier.split('/')
                let key = parts.slice(parts.length-1)[0]
                let prop = Object.keys(modules).find(prop => prop.includes(key))
                let mod = null
                if(prop) mod = modules[specifier]
                if(mod) return mod
                const data = await Deno.readFile(path.join(__dirname, specifier), {encoding: 'utf8'})
                modules[specifier] = new SourceTextModule(data, {
                    context: dom.getInternalVMContext()
                })
                return modules[specifier]
            })
            await app.evaluate()
        } catch(e){
            console.error(e)
        }
    }
    return modules
}

export default { ModuleLoader };