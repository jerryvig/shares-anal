'use strict';
//var $ = require('jQuery'),
var fs = require('fs'),
    stats = require('stats-lite'),
    ss = require('simple-statistics');

module.exports = {
    getYahooHistorical: function(ticker, callback) {
        var url = 'http://ichart.finance.yahoo.com/table.csv',
            requestData = {
                s: ticker,
                a: '00',
                b: '1',
                c: '2009',
                d: '00',
                e: '24',
                f: '2014',
                g: 'd',
                ignore: '.csv'
            };

        $.get(url, requestData, function(data) {
            var lines = data.split('\n');
            var rows = new Array();
            lines.forEach(function(line) {
                var columns = line.split(',');
                if (columns.length > 1) {
                    if (columns[0] !== 'Date') {
                        rows.push({
                            date: columns[0],
                            volume: new Number(columns[5]),
                            adjClose: new Number(columns[6])
                        });
                    }
                }
            });

            callback(rows);
        }).fail(function(err) {
            console.log('HTTP GET request failed for ticker = ' + ticker);
        });
    },

    /**
     * Takes a list of rows for a given ticker and returns an array of daily returns.
     *
     * @param rows
     */
    getDailyReturns: function(rows) {
        rows.sort(function(a, b) {
            if (a.date < b.date) return -1;
            if (a.date > b.date) return 1;
            return 0;
        });

        var returnRows = new Array();
        if (rows.length > 1) {
            for (var i = 1; i < rows.length; i++) {
                var dailyReturn = new Number((rows[i].adjClose - rows[i - 1].adjClose) / rows[i - 1].adjClose);
                returnRows.push({
                    d: rows[i].date.replace(/-/g, ''),
                    r: (Math.round(dailyReturn * 10000) / 10000.0)
                });
            }
        }
        return returnRows;
    },

    getTypedDailyReturns: function(rows) {
        var i = rows.length,
            dates = new Int32Array(rows.length),
            returns = new Float32Array(rows.length);

        while (i--){
            dates[i] = parseInt(rows[i].d);
            returns[i] = parseFloat(rows[i].r);
        }

        return {
            dates: dates,
            returns: returns
        };
    },

    saveTypedDailyReturns: function(hos) {
        fs.unlink('./Nasdaq100History.bin', function(){
            var i, j,
                typedReturns,
                dateReturnsBuffer;

            for (i=0; i<hos.length; i++) {
                dateReturnsBuffer = new Buffer(8);
                dateReturnsBuffer.write(hos[i].ticker, 0, 6);
                dateReturnsBuffer.writeUInt16LE(hos[i].rows.length*4*2, 6);

                fs.appendFileSync('./Nasdaq100History.bin', dateReturnsBuffer);
            }

            for (i=0; i<hos.length; i++) {
                typedReturns = sa.getTypedDailyReturns(hos[i].rows);
                dateReturnsBuffer = new Buffer(typedReturns.dates.length*4*2);

                for (j=0; j<typedReturns.dates.length; j++) {
                    dateReturnsBuffer.writeInt32LE(typedReturns.dates[j], j*4);
                    dateReturnsBuffer.writeFloatLE(typedReturns.returns[j], typedReturns.dates.length*4+j*4);
                }

                fs.appendFileSync('./Nasdaq100History.bin', dateReturnsBuffer);
            }
        });
    },

    getNegativeDaysPCT: function(rows, dayCount) {
        if (rows.length > dayCount) {
            var positiveReturnCount = 0;
            var negativeReturnCount = 0;

            for (var i = (dayCount - 1); i < rows.length - 1; i++) {
                var passedRule = true;
                for (var j = 0; j < dayCount; j++) {
                    if (rows[i - j].r > 0.0) {
                        passedRule = false;
                        break;
                    }
                }

                if (passedRule) {
                    if (rows[i + 1].r > 0.0) {
                        positiveReturnCount++;
                    } else {
                        negativeReturnCount++;
                    }
                }
            }

            var positivePercentage = new Number(positiveReturnCount / (positiveReturnCount + negativeReturnCount));
            return {
                dayCount: dayCount,
                positivePct: positivePercentage * 100.0 + '%',
                positiveCount: positiveReturnCount,
                totalCount: (positiveReturnCount + negativeReturnCount)
            };
        }
    },

    getExpFourDayPattern: function(rows) {
        if (rows.length > 4) {
            var positiveCount = 0;
            var negativeCount = 0;
            var coef = 1.0;

            for (var i = 3; i < rows.length - 1; i++) {
                var passedRule = false;
                if (rows[i - 3].r < 0) {
                    if (rows[i - 2].r < (coef * rows[i - 3].r)) {
                        if (rows[i - 1].r < (coef * rows[i - 2].r)) {
                            if (rows[i].r < (coef * rows[i - 1].r)) {
                                passedRule = true;
                            }
                        }
                    }
                }

                if (passedRule) {
                    if (rows[i + 1].r > 0.0) {
                        positiveCount++;
                    } else {
                        negativeCount++;
                    }
                }
            }

            return {
                positiveCount: positiveCount,
                totalCount: new Number(positiveCount + negativeCount)
            };
        }
    },

    summarizeExpFourDayAllTickers: function(historyObjects) {
        var summaryObject = {
            positiveCount: 0,
            totalCount: 0,
        };

        historyObjects.forEach(function(historyObject, idx) {
            var countsObj = getExpFourDayPattern(historyObject.rows);
            summaryObject.positiveCount += countsObj.positiveCount;
            summaryObject.totalCount += countsObj.totalCount;
        });
        summaryObject.positivePct = summaryObject.positiveCount / summaryObject.totalCount;
        console.log('summary = ' + JSON.stringify(summaryObject, undefined, 2));
    },

    loadHistoryObjects: function(filePath, callback) {
        fs.readFile(filePath, function(err, data) {
            var historyObjects = JSON.parse(data);
            callback(historyObjects);
        });
    },

    saveTickerListReturns: function(filePath, tickerList) {
        try {
            fs.unlinkSync(filePath);
        } catch (err) {
            console.log('File did not exist for unlinking');
        }

        fs.appendFile(filePath, '[', function(err) {});

        tickerList.forEach(function(ticker, idx) {
            setTimeout(function() {
                getYahooHistorical(ticker, function(rows) {
                    var sortedRows = getDailyReturns(rows);
                    var historyObject = {
                        ticker: ticker,
                        rows: sortedRows
                    };

                    if (idx == tickerList.length - 1) {
                        fs.appendFile(filePath, JSON.stringify(historyObject) + ']', function(err) {});
                    } else {
                        fs.appendFile(filePath, JSON.stringify(historyObject) + ',', function(err) {});
                    }
                });
            }, idx * 1000);
        });
    },

    summarizeDownDaysAllTickers: function(historyObjects) {
        var summaryObjects = new Array();

        for (var i = 1; i < 13; i++) {
            var positiveCount = 0;
            var totalCount = 0;
            historyObjects.forEach(function(historyObject, idx) {
                var pctObject = getNegativeDaysPCT(historyObject.rows, i);
                totalCount += pctObject.totalCount;
                positiveCount += pctObject.positiveCount;
                var tickerObj = {
                    ticker: historyObject.ticker
                };
                $.extend(pctObject, tickerObj);

                //console.log('output = ' + JSON.stringify(pctObject, undefined, 2));
            });

            var summaryObject = {
                dayCount: i,
                positiveCount: positiveCount,
                totalCount: totalCount,
                positivePct: new Number(positiveCount / totalCount)
            };

            summaryObjects.push(summaryObject);
        }

        summaryObjects.sort(function(a, b) {
            return (a.positivePct - b.positivePct);
        });
        console.log('summaries = ' + JSON.stringify(summaryObjects, undefined, 2));
    },

    loadTickerList: function(filePath, callback) {
        fs.readFile(filePath, function(err, data) {
            var tickerList = (data + '').split('\n');
            callback(tickerList);
        });
    },

    /**
     * Returns the number of records in the history file that was loaded.
     */
    getHistoryLength: function(hos) {
        var recCount = 0;
        var i = hos.length;
        while (i--) {
            recCount += hos[i].rows.length;
        }
        return recCount;
    },

    getPositiveCount: function(rows) {
        var positiveCount = 0;
        var i = rows.length;
        while (i--) {
            if (rows[i].r > 0.0) {
                positiveCount++;
            }
        }

        return {
            positivePct: positiveCount / rows.length,
            positiveCount: positiveCount,
            totalCount: rows.length
        }
    },

    /**
     *  Returns the positive percentage for a number of trailing days.
     *
     *  @param rows - The row objects that are assumed to be sorted by date in ascending order.
     *  @param dayCount - The number of trailing days to compute over.
     */
    getTrailingPositiveCount: function(rows, nDays) {
        if (rows.length >= nDays) {
            return getPositiveCount(rows.slice(rows.length - nDays));
        }
    },

    summarizePositivePct: function(historyObjects) {
        var summaryObject = {
            positiveCount: 0,
            totalCount: 0,
        };

        var i = historyObjects.length;
        while (i--) {
            var resultObj = this.getPositiveCount(historyObjects[i].rows);
            summaryObject.positiveCount += resultObj.positiveCount;
            summaryObject.totalCount += resultObj.totalCount;
        }

        summaryObject.positivePct = summaryObject.positiveCount / summaryObject.totalCount;
        return summaryObject;
    },

    /**
     *  Returns the Sharpe Ratio for a series and computes the ratio over the entire length of the series.
     *
     *  @param rows - The row objects assumed to be stored in ascending order.
     */
    getSeriesSharpeRatio: function(rows) {
        var returns = rows.map(function(row) {
            return row.r;
        });

        var stdev = stats.stdev(returns);
        var mean = stats.mean(returns);

        return {
            sharpe: mean / stdev,
            stdev: stdev,
            mean: mean
        };
    },

    /**
     *  Returns the Sharpe Ratio for a number of trailing days.
     *
     *  @param rows - The row objects that are assumed to be sorted by date in ascending order.
     *  @param dayCount - The number of trailing days to compute over.
     */
    getTrailingSharpeRatio: function(rows, nDays) {
        if (rows.length >= nDays) {
            return getSeriesSharpeRatio(rows.slice(rows.length - nDays));
        }
    },

    getSharpeSeries: function(rows, dayCount) {
        if (rows.length > dayCount) {
            var trailingArray = [],
                dayObjects = [];
            
            for (var i = 0; i < rows.length - 1; i++) {
                trailingArray.push(rows[i]);

                if (i >= dayCount - 1) {
                    var dayObject = getSeriesSharpeRatio(trailingArray);
                    dayObject.date = rows[i].d;
                    dayObject.nextReturn = rows[i + 1].r;
                    dayObjects.push(dayObject);
                    trailingArray.shift();
                }
            }
            return dayObjects;
        }
    },

    getSharpeNextReturnCorrelation: function(dayObjects) {
        var nextReturns = dayObjects.map(function(dayObj) {
            return dayObj.nextReturn;
        });
        var sharpes = dayObjects.map(function(dayObj) {
            return dayObj.sharpe;
        });

        return ss.sample_correlation(nextReturns, sharpes);
    },

    getDayCountCorrelations: function(historyObjects) {
        var dayCountCorrelations = [];

        for (var i = 0; i < historyObjects.length; i++) {
            for (var dayCount = 2; dayCount < 100; dayCount += 2) {
                var sharpeSeries = getSharpeSeries(historyObjects[i].rows, dayCount);
                var nextReturnSharpeCorrelation = getSharpeNextReturnCorrelation(sharpeSeries);

                dayCountCorrelations.push({
                    ticker: historyObjects[i].ticker,
                    dayCount: dayCount,
                    correlation: nextReturnSharpeCorrelation
                });
            }
        }

        dayCountCorrelations.sort(function(a, b) {
            return (a.correlation - b.correlation);
        });
        return dayCountCorrelations;
    },

    /**
     * Returns the n-day trailing sharpe ratios for all tickers in a list sorted in ascending order by sharpe ratio.
     *
     * @param historyObjects - The list of the ticker daily history.
     * @param nDays - The number of trailing days over which to compute the trailing sharpe ratios.
     */
    getTrailingSharpeRatios: function(historyObjects, nDays) {
        var i = historyObjects.length,
            trailingSharpeRatios = [];

        while (i--) {
            var trailingObj = getTrailingSharpeRatio(historyObjects[i].rows, nDays);
            trailingObj.ticker = historyObjects[i].ticker;
            trailingSharpeRatios.push(trailingObj);
        }

        trailingSharpeRatios.sort(function(a, b) {
            return (a.sharpe - b.sharpe);
        });

        return trailingSharpeRatios;
    },

    getTrailingPositiveCounts: function(historyObjects, nDays) {
        var trailingCounts = historyObjects.map(function(historyObj) {
            var trailingObj = getTrailingPositiveCount(historyObj.rows, nDays);
            trailingObj.ticker = historyObj.ticker;
            return trailingObj;
        });

        trailingCounts.sort(function(a, b) {
            return (a.positivePct - b.positivePct);
        });

        return trailingCounts;
    },

    getPositiveCountSeries: function(rows, nDays) {
        if (rows.length > nDays) {
            var trailingArray = new Array();
            var dayObjects = new Array(rows.length - 1);
            for (var i = 0; i < rows.length - 1; i++) {
                trailingArray.push(rows[i]);

                if (i >= nDays - 1) {
                    var dayObject = getPositiveCount(trailingArray);
                    dayObject.date = rows[i].d;
                    dayObject.nextReturn = rows[i + 1].r;
                    dayObjects.push(dayObject);
                    trailingArray.shift();
                }
            }
            return dayObjects;
        }
    },

    getPositiveCountNextDayCorrelation: function(dayObjects) {
        var nextReturns = [];
        var positivePctArray = [];
        for (var i = 0; i < dayObjects.length; i++) {
            nextReturns.push(dayObjects[i].nextReturn);
            positivePctArray.push(dayObjects[i].positivePct);
        };

        return ss.sample_correlation(nextReturns, positivePctArray);
    },

    getAllPositiveCountSeries: function(historyObjects, nDays) {
        var i = historyObjects.length;
        var allPositiveCountSeries = new Array(historyObjects.length);
        while (i--) {
            allPositiveCountSeries[i] = {
                ticker: historyObjects[i].ticker,
                dayObjects: getPositiveCountSeries(historyObjects[i].rows, nDays)
            };
        }

        return allPositiveCountSeries;
    },

    /**
     *  Utility method for benchmarking time taken to execute a function.
     *
     */
    benchmark: function(fn, args1, args2) {
        var start = process.hrtime();
        var result = fn(args1, args2);
        var end = process.hrtime(start);
        console.log('exec time = ' + end);
        return result;
    }
}

/* Example usage.
var sa = require('./SharesAnal.js'),
    hos = null;
sa.loadHistoryObjects('/home/superadmin/workspace/yahoo/Nasdaq100History.json', function(_hos) {
    hos = _hos;
    var t0 = process.hrtime();
    var summary = sa.summarizePositivePct(hos);
    var diff = process.hrtime(t0)[1] / 1000;
    console.log(JSON.stringify(summary));
    console.log('exec time = ' + diff);
}); */

/* var sa = require('./SharesAnal.js'),
    hos = null;

sa.loadHistoryObjects('/home/superadmin/workspace/yahoo/Nasdaq100History.json', function(_hos) {
    hos = _hos;
    sa.saveTypedDailyReturns(hos);
}); */