#!/usr/bin/ruby
require 'json'
require 'date'

puts "Content-Type: application/json\n\n"
data = {
    "message" => "Hello Ruby World",
    "language" => "Ruby",
    "date" => DateTime.now.to_s,
    "ip" => ENV['REMOTE_ADDR'],
    "team" => ["Aaron Chiuwei", "Kile Hsu", "Varun Sharma"]
}
puts JSON.generate(data)
