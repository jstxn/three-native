class ThreeNative < Formula
  desc "Build Three.js scenes for native iOS and the web"
  homepage "https://www.npmjs.com/package/@jstxn/three-native"
  url "https://registry.npmjs.org/@jstxn/three-native/-/three-native-0.1.0.tgz"
  sha256 "ef86691e8c5bee68bd446c24aa80d5ab462b3899157926b70dbb25b567cbd967"
  license "MIT"
  depends_on "node"

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"bin/three-native.mjs" => "three-native"
  end

  test do
    assert_equal "0.1.0", shell_output("#{bin}/three-native --version").strip
  end
end
