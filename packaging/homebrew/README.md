# Homebrew distribution

`three-native.rb` installs the same dependency-free CLI as the npm tarball. Its
URL targets the first npm release. The package has not been published yet, so
`brew install` from that URL is not available until release.

Before publishing, run `npm pack ./packages/three-native --pack-destination
./artifacts`, update the formula's SHA-256 from that exact tarball, publish the
npm package, and put the formula in an owned Homebrew tap. Then users can run:

```sh
brew install <your-tap>/three-native
```

Homebrew installs the CLI, not a local npm module. The generated default config
is a plain object and works with this installation. The optional `defineConfig`
import requires `@jstxn/three-native` as a project dependency.
