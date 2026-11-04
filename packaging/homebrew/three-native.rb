class ThreeNative < Formula
  desc "Build Three.js scenes for native iOS and the web"
  homepage "https://github.com/jstxn/three-native"
  url "https://registry.npmjs.org/@jstxn/three-native/-/three-native-0.4.0.tgz"
  sha256 "5482a92ac6ab3f000ca9acaef5c2cd9306c03386b43819054117dd845d4ea559"
  license "MIT"
  depends_on "node"

  def install
    libexec.install Dir["*"]
    cd libexec do
      system "npm", "install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"
    end
    bin.install_symlink libexec/"bin/three-native.mjs" => "three-native"
  end

  test do
    assert_equal "0.4.0", shell_output("#{bin}/three-native --version").strip
  end
end
