import * as path from "jsr:@std/path";
import { typeByExtension } from "jsr:@std/media-types/type-by-extension";
import { extname } from "jsr:@std/path/extname";

/* gets file data for a file related to an HTTP request */
async function fileForContext( config, ctx ) {
    const req = ctx.request;
    const url = new URL(req.url); 

    const pathargs = [ config.root, url.pathname ];
    if ( this.index )
        if ( url.pathname.split().pop() == '/') pathargs.push(this.index);

    const file = {
        name: path.join( ...pathargs )
    }
    file.handle = await Deno.open( file.name );
    file.mimetype = typeByExtension( extname( file.name ))

    file.info   = await file.handle.stat();
    return file;
}

export default {
    fileForContext
}