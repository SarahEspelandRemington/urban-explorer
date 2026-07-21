require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name             = 'NowPlayingModule'
  s.version          = package['version']
  s.summary          = package['description']
  s.description      = package['description']
  s.license          = 'Proprietary'
  s.author           = 'Streetlit'
  s.homepage         = 'https://streetlit.app'
  s.platforms        = { :ios => '15.1' }
  s.swift_version    = '5.9'
  s.source           = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,swift}"
end
