// Hugo's js.Build exposes its "params" option as this module. Each bundle gets
// its own params from layouts/_partials/js.html, so each importer casts the
// value to the shape that js.html gives its bundle. The unit tests run the
// modules in Bun, where test/setup.ts provides the module.
declare module "@params" {
  const params: unknown;
  export default params;
}
