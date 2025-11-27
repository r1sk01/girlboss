declare module "*.png" {
    const path: `${string}.png`;
    export = path;
}

declare module "*.module.css" {
    const classes: { readonly [key: string]: string };
    export = classes;
}
