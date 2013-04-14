//xml2js in the require path)

var sys = require('util'),
    rest = require('restler'),
    xml2js = require('xml2js');

//callback for getTime

var parser = new xml2js.Parser();

//given a station, will return departing destination/times
function getTime (get_station, done) {
    rest.get('http://www.bart.gov/dev/eta/bart_eta.xml').on('complete', function(result) {
      if (result instanceof Error) {
        sys.puts('Error: ' + result.message);
        this.retry(5000); // try again after 5 sec
      } else {
        //console.log(result)
        //return result
        parser.parseString(result, function(err, data) {
            //console.log("ALL STATIONS", data.root.station)
            //console.log(get_station)
            for (var i=0; i<data.root.station.length; i++) {
                if (data.root.station[i]["name"] == get_station) {
                    //console.log("you're at " + get_station +", and can leave for:")
                    //console.log(data.root.station[i]["eta"])
                    var result = data.root.station[i]["eta"];
                    done(result)
                }
            }
        })}
    });
}
//example call with callback passed in
getTime("Lake Merritt", function(result) {
    console.log(result)
})

