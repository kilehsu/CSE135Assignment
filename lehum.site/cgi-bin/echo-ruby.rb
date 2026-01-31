#!/usr/bin/ruby
require 'json'
require 'cgi'

puts "Content-Type: application/json\n\n"

method = ENV['REQUEST_METHOD']
content_type = ENV['CONTENT_TYPE']
body_str = $stdin.read

data = {}
if method == 'GET'
    cgi = CGI.new
    cgi.params.each do |key, values|
        data[key] = values.length == 1 ? values[0] : values
    end
else
    if content_type && content_type.include?('application/json')
        begin
            data = JSON.parse(body_str)
        rescue
            data = {"error" => "Invalid JSON"}
        end
    else
        params = CGI::parse(body_str)
        params.each do |key, values|
            data[key] = values.length == 1 ? values[0] : values
        end
    end
end

headers = {}
ENV.each do |key, value|
    if key.start_with?('HTTP_')
        headers[key] = value
    end
end

response = {
    "received" => {
        "method" => method,
        "headers" => headers,
        "body" => data,
        "raw_body" => body_str
    },
    "meta" => {
        "hostname" => ENV['SERVER_NAME'],
        "date" => Time.now.to_s,
        "ip" => ENV['REMOTE_ADDR'],
        "user_agent" => ENV['HTTP_USER_AGENT']
    }
}

puts JSON.pretty_generate(response)
