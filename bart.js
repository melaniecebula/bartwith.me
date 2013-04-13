//xml2js in the require path)

var sys = require('util'),
    rest = require('restler'),
    xml2js = require('xml2js');


rest.get('http://www.bart.gov/dev/eta/bart_eta.xml').on('complete', function(result) {
  if (result instanceof Error) {
    sys.puts('Error: ' + result.message);
    this.retry(5000); // try again after 5 sec
  } else {
    sys.puts(result);
  }
});
