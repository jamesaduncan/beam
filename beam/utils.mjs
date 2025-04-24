import * as path from "jsr:@std/path";
import { typeByExtension } from "jsr:@std/media-types/type-by-extension";
import { extname } from "jsr:@std/path/extname";

/* gets file data for a file related to an HTTP request */
export async function fileForContext( config, ctx ) {
    const req = ctx.request;
    if ( req.file ) {
        return req.file;
    }
    
    const url = new URL(req.url); 

    const pathargs = [ config.root, url.pathname ];
    const file = {
        name: path.join( ...pathargs )
    }
    file.requested = file.name;
    if ( config.index ) {
        if ( url.pathname.split("").pop() == '/') {
            file.requested = file.name;
            pathargs.push(config.index);
            file.name = path.join(...pathargs)
        }
    }

    file.handle = await Deno.open( file.name );
    file.mimetype = typeByExtension( extname( file.name ))

    file.info   = await file.handle.stat();

    req.file = file;
    return file;
}

export default {
    fileForContext
}