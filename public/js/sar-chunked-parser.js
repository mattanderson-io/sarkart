/**
 * SARkart Chunked Parser Override
 * Replaces the synchronous loaded() function with a chunked async version
 * that yields to the browser every ~500K lines for UI updates.
 */
(function() {
  // Save reference to the original loaded function's post-parse logic
  // We'll override getAsText's onload to use our chunked parser instead
  
  var CHUNK_SIZE = 200000; // lines per chunk - tune for ~200ms per chunk
  
  // Override: when Process Data is clicked, use chunked parsing
  $(function() {
    $('#btnProcessData').off('click').on('click', function() {
      if (!window._pendingResult) return;
      $(this).hide();
      updateProgress(25, "Parsing SAR data... (0%)");
      
      // Small delay to let the UI update before heavy work starts
      setTimeout(function() {
        chunkedLoaded(window._pendingResult);
        window._pendingResult = null;
      }, 50);
    });
  });
  
  function chunkedLoaded(e) {
    var o = e.target.result;
    var i = "";
    
    // Split into lines (this is fast, ~300ms even for 300MB)
    var lines = o.split("\n");
    var lineCount = lines.length;
    o = null; // free memory
    
    var a = {"%usr":1,"device":1,"bread/s":1,"swpin/s":1,"iget/s":1,"rawch/s":1,"proc-sz":1,"msg/s":1,"atch/s":1,"pgout/s":1,"freemem":1,"sml_mem":1,"CPU":1,"proc/s":1,"pswpin/s":1,"pgpgin/s":1,"tps":1,"frmpg/s":1,"kbmemfree":1,"kbswpfree":1,"kbhugfree":1,"dentunusd":1,"runq-sz":1,"DEV":1,"IFACE":1,"call/s":1,"scall/s":1,"totsck":1,"TTY":1,"INTR":1,"slots":1};
    var headersSet = {};
    var wsRx = /\s+/g;
    var numRx = /^[\d.+-]+$/;
    var sKey = "", inS = false;
    var n, r = "", s = "";
    
    // These will be set as globals when done
    var _headers = [];
    var _idxLocal = {};
    var _allDatesLocal = {};
    var _allDatesArrLocal = [];
    var _cachedLinesLocal = [];
    
    var currentLine = 0;
    
    function processChunk() {
      var end = Math.min(currentLine + CHUNK_SIZE, lineCount);
      var line, firstChar, token1, lastToken, csvLine;
      var sp1, t1s, t1e, le, ls;
      
      for (var l = currentLine; l < end; l++) {
        line = lines[l];
        if (!line) { inS = false; continue; }
        firstChar = line.charCodeAt(0);
        
        if (firstChar === 65) {
          if (line.charCodeAt(1) === 118) { inS = false; continue; }
          if (line.charCodeAt(1) === 73) { n = line.split(wsRx); r = n[5]; s = ""; sKey = ""; _cachedLinesLocal.push(line.replace(wsRx, ",")); inS = false; continue; }
          continue;
        }
        if (firstChar === 76 && line.charCodeAt(1) === 105) {
          n = line.split(wsRx); r = n[3]; s = ""; sKey = "";
          _cachedLinesLocal.push(line.replace(wsRx, ","));
          inS = false; continue;
        }
        if (firstChar === 83) {
          if (line.charCodeAt(1) === 117) { n = line.split(wsRx); r = n[5]; s = ""; sKey = ""; _cachedLinesLocal.push(line.replace(wsRx, ",")); inS = false; }
          continue;
        }
        if (firstChar < 48 || firstChar > 57) continue;
        
        sp1 = line.indexOf(" ");
        if (sp1 === -1) continue;
        t1s = sp1 + 1;
        while (t1s < line.length && line.charCodeAt(t1s) === 32) t1s++;
        t1e = t1s;
        while (t1e < line.length && line.charCodeAt(t1e) !== 32 && line.charCodeAt(t1e) !== 9) t1e++;
        token1 = line.substring(t1s, t1e);
        
        le = line.length - 1;
        while (le > 0 && (line.charCodeAt(le) === 32 || line.charCodeAt(le) === 9)) le--;
        ls = le;
        while (ls > 0 && line.charCodeAt(ls - 1) !== 32 && line.charCodeAt(ls - 1) !== 9) ls--;
        lastToken = line.substring(ls, le + 1);
        
        if ((lastToken === "IFACE" || lastToken === "DEV") && t1s < ls) {
          n = line.split(wsRx); n.pop(); n.splice(1, 0, lastToken);
          sKey = lastToken + "-" + n[2]; s = sKey + ",";
          var hdr3 = n.slice(1).join(",");
          if (!headersSet[hdr3]) { headersSet[hdr3] = 1; _headers.push(hdr3); }
          inS = true; continue;
        }
        if (token1 === "AM" || token1 === "PM") {
          n = line.split(wsRx);
          if (a[n[2]]) { sKey = n[2] + "-" + n[3]; s = sKey + ","; var c = n.slice(2).join(","); if (!headersSet[c]) { headersSet[c] = 1; _headers.push(c); } inS = false; continue; }
        } else if (a[token1]) {
          n = line.split(wsRx); sKey = token1 + "-" + n[2]; s = sKey + ",";
          var u = n.slice(1).join(",");
          if (!headersSet[u]) { headersSet[u] = 1; _headers.push(u); }
          inS = false; continue;
        }
        
        if (inS && !numRx.test(lastToken)) {
          n = line.split(wsRx); n.pop(); n.splice(1, 0, lastToken);
          csvLine = s + r + "|" + n.join(",");
        } else {
          csvLine = s + r + "|" + line.replace(wsRx, ",");
        }
        
        if (!_idxLocal[sKey]) _idxLocal[sKey] = [];
        _idxLocal[sKey].push(csvLine);
        _cachedLinesLocal.push(csvLine);
        
        var ci = sKey.length + 1, pi = csvLine.indexOf("|", ci);
        if (pi > -1) {
          var dt = csvLine.substring(ci, pi);
          if (!_allDatesLocal[dt]) { _allDatesLocal[dt] = 1; _allDatesArrLocal.push(dt); }
        }
      }
      
      currentLine = end;
      var pct = Math.round((currentLine / lineCount) * 100);
      var barPct = 25 + Math.round(pct * 0.55); // map 0-100% to 25-80% on the bar
      updateProgress(barPct, "Parsing SAR data... (" + pct + "%)");
      
      if (currentLine < lineCount) {
        // Yield to browser, then continue
        setTimeout(processChunk, 0);
      } else {
        // Done parsing - run post-processing
        finishParsing();
      }
    }
    
    function finishParsing() {
      updateProgress(82, "Building data index...");
      
      setTimeout(function() {
        // Memory-optimized: cache only the first line (for getOS/Hostname/Kernel/ServerInfo)
        // instead of holding a 200MB+ fileOut string and a duplicate _cachedLines array.
        window._firstLine = (_cachedLinesLocal[0] || "").replace(/user/g, "usr");
        _cachedLinesLocal = null; // free ~250MB
        fileOut = "";             // parser used to stash the full text here; no one reads it now
        _cachedLines = null;      // no chart function actually reads this (verified)
        headers = _headers;
        _idx = _idxLocal;
        _allDatesArrLocal.sort(function(a,b){var ap=a.split("/"),bp=b.split("/");var ak=parseInt(ap[2],10)*10000+parseInt(ap[0],10)*100+parseInt(ap[1],10);var bk=parseInt(bp[2],10)*10000+parseInt(bp[0],10)*100+parseInt(bp[1],10);return ak-bk});
        _allDatesArr = _allDatesArrLocal;
        _fullIdx = {};
        for (var k in _idx) _fullIdx[k] = _idx[k].slice();
        
        // Set up date filter function
        window._filterByDates = function(dates) {
          _idx = {};
          for (var k in _fullIdx) {
            _idx[k] = [];
            for (var j = 0; j < _fullIdx[k].length; j++) {
              var ln = _fullIdx[k][j], ci = ln.indexOf(","), di = ln.indexOf("|", ci);
              if (ci > -1 && di > -1) {
                var d = ln.substring(ci + 1, di);
                if (!dates || dates.indexOf(d) > -1) _idx[k].push(ln);
              } else {
                _idx[k].push(ln);
              }
            }
          }
        };
        
        updateProgress(88, "Detecting server info...");
        
        setTimeout(function() {
          getServerInfo();
          $("#pageTitle").html("");
          $("#containerA").html("");
          $("#containerB").html("");
          $("#containerC").html("");
          
          updateProgress(90, "Loading dashboard...");
          
          setTimeout(function() {
            // Run the OS-specific dashboard setup
            switch(getOS()) {
              case "LINUX":
                $("#peakBlock").addClass("add");
                $("#btnCPU, #btnFile, #btnTTY, #btnMemAlloc, #btnSysCalls").hide("fast");
                show("#nav-container, #btnSAR, #btnCPUs, #btnMem, #btnDevices, #btnProcesses, #btnSwap, #btnPaging, #btnPage, #btnIO, #btnLoad, #btnInterfaceTraffics, #btnInterfaceErrors, #btnNFS, #btnSockets, #btnReport, #btnContact");
                
                updateProgress(92, "Calculating peak values...");
                // Fast peak CPU - scan only 'all' lines, O(N) with no per-core loop
                (function() {
                  var cpuLines = _idx["CPU-%usr"] || [];
                  var peak = 0, peakTime = "";
                  // Only scan 'all' CPU lines for peak (skip per-core)
                  for (var i = 0; i < cpuLines.length; i++) {
                    var parts = cpuLines[i].split(",");
                    if (parts[2] === "all") {
                      var val = parseFloat(parts[3]);
                      if (val > peak) {
                        peak = val;
                        var timeParts = parts[1].split("|");
                        peakTime = timeParts[0] + " " + timeParts[1];
                      }
                    }
                  }
                  $("#peakCPU").html(parseInt(peak));
                  $("#peakCPUTime").html(peakTime);
                })();
                getGenericData("runq-sz-plist-sz", 1, "no", "#peakLoad");
                (function(){var _h=grepHeaders("kbmemfree");if(-1!=_h){var _c=_h.split(","),_k=[..._c].splice(0,2).join("-"),_mi=_c.indexOf("%memused")+1;getGenericData(_k,_mi,"no","#peakMemory")}})();
                getGenericData("kbswpfree-kbswpused", 3, "no", "#peakIO");
                
                updateProgress(95, "Loading devices & interfaces...");
                // Load devices and interfaces at start (not CPU - too many cores)
                getDevices("DEV-tps", "no", null);
                getInterfaceTraffic("IFACE-rxpck/s", "no", null);
                getInterfaceErrors("IFACE-rxerr/s", "no", null);
                
                printPieChart("peakCPUChart", parseInt($("#peakCPU").html()), "#00ADEF");
                printPieChart("peakLoadChart", parseInt($("#peakLoad").html()), "#119944");
                printPieChart("peakMemoryChart", parseInt($("#peakMemory").html()), "#F1912E");
                
                // Load CPU list in background using chunked processing
                
                
                setTimeout(function() {
                  // Build per-core CPU index and sidebar list in chunks
                  var cpuLines = _idx["CPU-%usr"] || [];
                  var cpuIds = [];
                  var cpuIdSet = {};
                  var chunkIdx = 0;
                  var CHUNK = 10000;
                  
                  function cpuChunk() {
                    var end = Math.min(chunkIdx + CHUNK, cpuLines.length);
                    for (var i = chunkIdx; i < end; i++) {
                      var parts = cpuLines[i].split(",");
                      var id = parts[2];
                      if (!cpuIdSet[id]) { cpuIdSet[id] = 1; cpuIds.push(id); }
                      if (!_cpuByCore) _cpuByCore = {};
                      if (!_cpuByCore[id]) _cpuByCore[id] = [];
                      _cpuByCore[id].push(cpuLines[i]);
                    }
                    chunkIdx = end;
                    var pct = Math.round((chunkIdx / cpuLines.length) * 100);
                    
                    
                    if (chunkIdx < cpuLines.length) {
                      setTimeout(cpuChunk, 0);
                    } else {
                      // Done - build the sidebar list
                      cpuIds.sort(naturalCompare);
                      $("#ulCPU").empty();
                      for (var c = 0; c < cpuIds.length; c++) {
                        $("#ulCPU").append('<li><a href="#" data-sns="' + c + '"><i class="fa fa-microchip" style="color: #6A55C2" aria-hidden="true"><span class="icon-bg bg-violet"></span></i>' + cpuIds[c] + '</a></li>');
                      }
                      $("#cssmenu ul ul li:odd").addClass("odd");
                      $("#cssmenu ul ul li:even").addClass("even");
                      $("#ulCPU").on("click", "a", function(e) {
                        chartPage();
                        e.preventDefault();
                        var t = $(this).data("sns");
                        getCPUchart(cpuIds[t]);
                      });
                      // Re-enable button
                      
                    }
                  }
                  cpuChunk();
                }, 500);
                if (_allDatesArr && _allDatesArr.length > 1) {
                  $("#dateFilterBlock").removeClass("hide").show();
                  var sel1 = $("#dateFilterStart"), sel2 = $("#dateFilterEnd");
                  sel1.empty(); sel2.empty();
                  for (var i = 0; i < _allDatesArr.length; i++) {
                    sel1.append("<option value='" + _allDatesArr[i] + "'>" + _allDatesArr[i] + "</option>");
                    sel2.append("<option value='" + _allDatesArr[i] + "'>" + _allDatesArr[i] + "</option>");
                  }
                  sel2.val(_allDatesArr[_allDatesArr.length - 1]);
                  $("#dateFilterInfo").html(_allDatesArr.length + " days detected");
                } else {
                  $("#dateFilterBlock").hide();
                }
                break;
                
              case "AIX":
                $("#btnCPUs, #btnMemFree, #btnMemAlloc, #btnSwapUsg, #btnSwap, #btnPage, #btnInterfaceTraffics, #btnInterfaceErrors, #btnNFS, #btnSockets").hide("fast");
                show("#nav-container, #btnSAR, #btnCPU, #btnMem, #btnDevices, #btnProcesses, #btnPaging, #btnIO, #btnLoad, #btnSysCalls, #btnFile, #btnTTY, #btnReport, #btnContact");
                break;
                
              case "SUNOS":
                $("#peakBlock").addClass("add");
                $("#btnCPUs, #btnMemFree, #btnSwapUsg, #btnPage, #btnInterfaceTraffics, #btnInterfaceErrors, #btnNFS, #btnSockets").fadeOut("fast");
                show("#nav-container, #btnSAR, #btnCPU, #btnMem, #btnMemAlloc, #btnDevices, #btnProcesses, #btnSwap, #btnPaging, #btnIO, #btnLoad, #btnSysCalls, #btnFile, #btnTTY, #btnReport, #btnContact");
                break;
            }
            
            updateProgress(99, "Almost ready...");
            $("#sidebar").removeClass("active");
            $(".contDash").show();
            updateProgress(100, "Done!");
            setTimeout(function() { progressBarReset(); }, 1000);
            $("#sidebar").show("fast");
            $("#sidebarCollapse").show("fast");
            
          }, 10);
        }, 10);
      }, 10);
    }
    
    // Start chunked processing
    processChunk();
  }
  
})();
