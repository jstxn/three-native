class ThreeNative < Formula
  desc "Build Three.js scenes for native iOS and the web"
  homepage "https://github.com/jstxn/three-native"
  url "https://registry.npmjs.org/@jstxn/three-native/-/three-native-0.3.0.tgz"
  sha256 "0c7606f2ed4c6ec3e22606fd48b9834ef8357fd31a8e0333dd49fb7c35857394"
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
    assert_equal "0.3.0", shell_output("#{bin}/three-native --version").strip
  end
end
