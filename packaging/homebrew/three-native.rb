class ThreeNative < Formula
  desc "Build Three.js scenes for native iOS and the web"
  homepage "https://github.com/jstxn/three-native"
  url "https://registry.npmjs.org/@jstxn/three-native/-/three-native-0.2.0.tgz"
  sha256 "37dc6e17b67a23ba706e80b8b160215d5c67c52977331d045bc8e372b3b87f27"
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
