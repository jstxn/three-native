class ThreeNative < Formula
  desc "Build Three.js scenes for native iOS and the web"
  homepage "https://www.npmjs.com/package/@jstxn/three-native"
  url "https://registry.npmjs.org/@jstxn/three-native/-/three-native-0.2.0.tgz"
  sha256 "88e2a5b19c0f48b41eb4967148af35b4841299159858ac0e1d0ac06544985dd8"
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
    assert_equal "0.2.0", shell_output("#{bin}/three-native --version").strip
  end
end
