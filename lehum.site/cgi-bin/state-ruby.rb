#!/usr/bin/ruby
require 'cgi'
require 'fileutils'
require 'securerandom'

# Initialize CGI
cgi = CGI.new

# Session ID from cookie
session_key = 'CGISESSID'
session_id = nil

# Check cookies
cookie = cgi.cookies[session_key]
if cookie && !cookie.empty?
    session_id = cookie[0] # Value is array of strings
end

# Generate new session if needed
new_session = false
if session_id.nil? || session_id.empty?
    session_id = SecureRandom.uuid
    new_session = true
end

# Session storage
session_dir = '/tmp/cgi_sessions_rb'
FileUtils.mkdir_p(session_dir)
session_file = File.join(session_dir, session_id)

# Load data
session_data = {}
if File.exist?(session_file)
    begin
        session_data = Marshal.load(File.read(session_file))
    rescue
        session_data = {}
    end
end

# Handle logic
name_input = cgi['name']
if name_input && !name_input.empty?
    session_data['name'] = name_input
end

if cgi['clear'] && !cgi['clear'].empty?
    session_data = {}
    File.delete(session_file) if File.exist?(session_file)
end

# Save data
File.write(session_file, Marshal.dump(session_data))

# Output headers
if new_session
    # Manual cookie header construction as CGI's header method can be tricky with multiple headers in raw print
    # But using cgi.out is better.
    cookie_obj = CGI::Cookie.new('name' => session_key, 'value' => session_id, 'path' => '/')
    puts cgi.header('type' => 'text/html', 'cookie' => [cookie_obj])
else
    puts cgi.header('type' => 'text/html')
end

puts "<!DOCTYPE html>"
puts "<html><body>"
puts "<h1>Session Test (Ruby)</h1>"
name = session_data['name'] || 'Guest'
puts "<p>Hello, #{name}!</p>"
puts "<form method='POST'>"
puts "<label>Enter Name: <input type='text' name='name'></label>"
puts "<button type='submit'>Save</button>"
puts "</form>"
puts "<br>"
puts "<form method='POST'>"
puts "<input type='hidden' name='clear' value='1'>"
puts "<button type='submit'>Clear Session</button>"
puts "</form>"
puts "<br><a href='state-ruby.rb'>Refresh Page</a>"
puts "</body></html>"
