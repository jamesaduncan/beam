import * as path from "jsr:@std/path";

class Provision {
    constructor() {
        Object.defineProperties(this, {
            "info": {
                get() {
                    const self = this;
                    return (async () => {
                        return await self.getInfoImplementation();
                    })
                }
            }
        })
    }
}

class FileSystemProvision {
    async getInfoImplementation() {
        const fsInfo = await this.handle.stat();
    }
}

class Provider {

    constructor( options = {} ) {
        Object.assign(this, options)
    }

    fromURL( aURL ) {
        throw new Error('unimplemented')
    }

}

class FileSystemProvider extends Provider {

    constructor( options = { root: "/" } ) {
        super();
        this.root = options.root;
    }

    fromURL( aURL ) {

    }
}

export default { Provider, FileSystemProvider, Provision, FileSystemProvision };