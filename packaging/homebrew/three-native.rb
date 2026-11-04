class ThreeNative < Formula
  desc "Build Three.js scenes for native iOS and the web"
  homepage "https://github.com/jstxn/three-native"
  url "https://registry.npmjs.org/@jstxn/three-native/-/three-native-0.4.0.tgz"
  sha256 "10c009ae5af087f7f80c98d337ca4c297bbb25de02f665f3c00a08586823a881"
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
