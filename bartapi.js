//MW9S-E7SL-26DU-VV8V

var Bart = require('bart-api')

var key = 'MW9S-E7SL-26DU-VV8V'

var bart = new Bart(key)

  // Get arrival schedule information
function depart(start, destination, done) {
  bart.sched.depart({
    orig: start,
    dest: destination
  }, function (err, xml, body) {
    if (err) {
      throw err;
    }

    // xml is a parser instance from https://github.com/polotek/libxmljs
    // it supports xpath and more!
    var trips = [];

    xml.find('/root/schedule/request/trip').forEach(function (trip) {
      trips.push({
        orig: trip.attr('origin').value(),
        dest: trip.attr('destination').value(),
        times: {
          orig: trip.attr('origTimeMin').value(),
          dest: trip.attr('destTimeMin').value()
        },
        legs: trip.find('leg').map(function (leg) {
          return {
            orig: leg.attr('origin').value(),
            dest: leg.attr('destination').value(),
            line: leg.attr('line').value(),
            head: leg.attr('trainHeadStation').value(),
            times: {
              orig: leg.attr('origTimeMin').value(),
              dest: leg.attr('destTimeMin').value()
            }
          };
        })
      })
    });

    // If you hate libxmljs, you can access the raw buffered body too!
    //
    //     console.log(body);
    //
    // bart.sched.arrive() will also return the request instance, if you
    // would rather parse the output using a streaming parser such as
    // sax-js.
    done(trips)
  });
}

//example call with callback passed in
depart("12th", "19th", function done(data) {
    console.log(data)
})