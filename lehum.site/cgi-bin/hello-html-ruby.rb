#!/usr/bin/ruby
require 'date'

puts "Content-Type: text/html\n\n"
puts "<!DOCTYPE html>"
puts "<html>"
puts "<head><title>Hello Ruby World</title></head>"
puts "<body>"
puts "<h1 align='center'>Hello Ruby World</h1>"
puts "<hr/>"
puts "<p>Hello World</p>"
puts "<p>This page was generated with the Ruby programming language</p>"
puts "<p>This program was generated at: #{DateTime.now}</p>"
puts "<p>Your current IP Address is: #{ENV['REMOTE_ADDR']}</p>"
puts "<p>Team Members: Aaron Chiuwei, Kile Hsu, Varun Sharma</p>"
puts "</body>"
puts "</html>"
