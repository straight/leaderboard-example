$(document).ready(function() {

    //
    //  Instantiate IOTA
    //
    var iota = new IOTA({
		'host': 'http://service.iotasupport.com',
        'port': 14265
    });
	const MAX_TIMESTAMP_VALUE = (Math.pow(3,27) - 1) / 2; // from curl.min.js
	curl.init();

    // adapted from https://github.com/iotaledger/wallet/blob/master/ui/js/iota.lightwallet.js
    const localAttachToTangle = function(trunkTransaction, branchTransaction, minWeightMagnitude, trytes, callback) {
        const ccurlHashing = function(trunkTransaction, branchTransaction, minWeightMagnitude, trytes, callback) {
            const iotaObj = iota;

            // inputValidator: Check if correct hash
            if (!iotaObj.valid.isHash(trunkTransaction)) {
                return callback(new Error("Invalid trunkTransaction"));
            }

            // inputValidator: Check if correct hash
            if (!iotaObj.valid.isHash(branchTransaction)) {
                return callback(new Error("Invalid branchTransaction"));
            }

            // inputValidator: Check if int
            if (!iotaObj.valid.isValue(minWeightMagnitude)) {
                return callback(new Error("Invalid minWeightMagnitude"));
            }

            var finalBundleTrytes = [];
            var previousTxHash;
            var i = 0;

            function loopTrytes() {
                getBundleTrytes(trytes[i], function(error) {
                    if (error) {
                        return callback(error);
                    } else {
                        i++;
                        if (i < trytes.length) {
                            loopTrytes();
                        } else {
                            // reverse the order so that it's ascending from currentIndex
                            return callback(null, finalBundleTrytes.reverse());
                        }
                    }
                });
            }

            function getBundleTrytes(thisTrytes, callback) {
                // PROCESS LOGIC:
                // Start with last index transaction
                // Assign it the trunk / branch which the user has supplied
                // IF there is a bundle, chain  the bundle transactions via
                // trunkTransaction together

                var txObject = iotaObj.utils.transactionObject(thisTrytes);
                txObject.tag = txObject.obsoleteTag;
                txObject.attachmentTimestamp = Date.now();
                txObject.attachmentTimestampLowerBound = 0;
                txObject.attachmentTimestampUpperBound = MAX_TIMESTAMP_VALUE;
                // If this is the first transaction, to be processed
                // Make sure that it's the last in the bundle and then
                // assign it the supplied trunk and branch transactions
                if (!previousTxHash) {
                    // Check if last transaction in the bundle
                    if (txObject.lastIndex !== txObject.currentIndex) {
                        return callback(new Error("Wrong bundle order. The bundle should be ordered in descending order from currentIndex"));
                    }

                    txObject.trunkTransaction = trunkTransaction;
                    txObject.branchTransaction = branchTransaction;
                } else {
                    // Chain the bundle together via the trunkTransaction (previous tx in the bundle)
                    // Assign the supplied trunkTransaciton as branchTransaction
                    txObject.trunkTransaction = previousTxHash;
                    txObject.branchTransaction = trunkTransaction;
                }

                var newTrytes = iotaObj.utils.transactionTrytes(txObject);

                curl.pow({trytes: newTrytes, minWeight: minWeightMagnitude}).then(function(nonce) {
                    var returnedTrytes = newTrytes.substr(0, 2673-81).concat(nonce);
                    var newTxObject= iotaObj.utils.transactionObject(returnedTrytes);

                    // Assign the previousTxHash to this tx
                    var txHash = newTxObject.hash;
                    previousTxHash = txHash;

                    finalBundleTrytes.push(returnedTrytes);
                    callback(null);
                }).catch(callback);
            }
            loopTrytes()
        }

        ccurlHashing(trunkTransaction, branchTransaction, minWeightMagnitude, trytes, function(error, success) {
            if (error) {
                console.log(error);
            } else {
                console.log(success);
            }
            if (callback) {
                return callback(error, success);
            } else {
                return success;
            }
        })
    }

    iota.api.attachToTangle = localAttachToTangle;
	
    var seed;
    var balance = 0;
    var address;

    function toggleSidebar() {
        $(".button").toggleClass("active");
        $("main").toggleClass("move-to-left");
        $(".sidebar-item").toggleClass("active");
        $(".sidebar").toggleClass("donotdisplay");
    }

    //
    //  Properly formats the seed, replacing all non-latin chars with 9's
    //  And extending it to length 81
    //
    function setSeed(value) {

        seed = "";
        value = value.toUpperCase();

        for (var i = 0; i < value.length; i++) {
            if (("9ABCDEFGHIJKLMNOPQRSTUVWXYZ").indexOf(value.charAt(i)) < 0) {
                seed += "9";
            } else {
                seed += value.charAt(i);
            }
        }
    }

    //
    // Gets the addresses and transactions of an account
    // As well as the current balance
    //  Automatically updates the HTML on the site
    //
    function getAccountInfo() {

        // Command to be sent to the IOTA API
        // Gets the latest transfers for the specified seed
        iota.api.getAccountData(seed, function(e, accountData) {

            console.log("Account data", accountData);

            // Update address
            if (!address && accountData.addresses[0]) {

                address = iota.utils.addChecksum(accountData.addresses[accountData.addresses.length - 1]);

                updateAddressHTML(address);
            }

            balance = accountData.balance;

            // Update total balance
            updateBalanceHTML(balance);
        })
    }

    //
    //  Generate address function
    //  Automatically updates the HTML on the site
    //
    function genAddress() {

        console.log("Generating an address");

        // Deterministically Generates a new address with checksum for the specified seed
        iota.api.getNewAddress(seed, {'checksum': true}, function(e,address) {

             if (!e) {

                console.log("NEW ADDRESS GENERATED: ", address)

                address = address;
                // Update the HTML on the site
                updateAddressHTML(address)
            }
        })
    }


    //
    //  Makes a new transfer for the specified seed
    //  Includes message and value
    //
    function sendTransfer(address, value, messageTrytes) {

        var transfer = [{
            'address': address,
            'value': parseInt(value),
            'message': messageTrytes
        }]

        console.log("Sending Transfer", transfer);

        // We send the transfer from this seed, with depth 4 and minWeightMagnitude 18
        iota.api.sendTransfer(seed, 4, 14, transfer, function(e) {

            if (e){

                var html = '<div class="alert alert-danger alert-dismissible" role="alert"><button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button><strong>ERROR!</strong>' + e + '.</div>'
                $("#send__success").html(JSON.stringify());

                $("#submit").toggleClass("disabled");

                $("#send__waiting").css("display", "none");

            } else {

                var html = '<div class="alert alert-info alert-dismissible" role="alert"><button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button><strong>Success!</strong> You have successfully sent your transaction. If you want to make another one make sure that this transaction is confirmed first (check in your client).</div>'
                $("#send__success").html(html);

                $("#submit").toggleClass("disabled");

                $("#send__waiting").css("display", "none");

                balance = balance - value;
                updateBalanceHTML(balance);
            }
        })
    }

    //
    // Menu Open/Close
    //
    $(".button").on("click tap", function() {
        toggleSidebar();
    });

    //
    // Set seed
    //
    $("#seedSubmit").on("click", function() {

        // We modify the entered seed to fit the criteria of 81 chars, all uppercase and only latin letters
        setSeed($("#userSeed").val());

        // Then we remove the input
        $("#enterSeed").html('<div class="alert alert-success" role="alert">Successfully saved your seed. You can generate an address now.</div>');

        // We fetch the latest transactions every 90 seconds
        getAccountInfo();
        setInterval(getAccountInfo, 90000);
    });

    //
    // Generate a new address
    //
    $("#genAddress").on("click", function() {
        if (!seed)
            return

        genAddress();
    })

    //
    // Send a new message
    //
    $("#submit").on("click", function() {

        if (!seed) {
            var html = '<div class="alert alert-warning alert-dismissible" role="alert"><button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button><strong>No Seed!</strong> You have not entered your seed yet. Do so on the Menu on the right.</div>'
            $("#send__success").html(html);
            return
        }

        if (!balance || balance === 0) {
            var html = '<div class="alert alert-warning alert-dismissible" role="alert"><button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button><strong>No Tokens!</strong> You do not have enough IOTA tokens. Make sure you have enough confirmed tokens.</div>'
            $("#send__success").html(html);
            return
        }

        var name = $("#name").val();
        var value = parseInt($("#value").val());
        var address = $("#address").val();
        var message = $("#message").val();

        if (!name || !value || !message)
            return

        if (value > balance) {
            var html = '<div class="alert alert-warning alert-dismissible" role="alert"><button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button><strong>Value too high!</strong> You have specified a too high value.</div>'
            $("#send__success").html(html);
            return
        }

        // the message which we will send with the transaction
        var messageToSend = {
            'name': name,
            'message': message
        }

        // Convert the user message into trytes
        // In case the user supplied non-ASCII characters we throw an error
        try {
            console.log("Sending Message: ", messageToSend);
            var messageTrytes = iota.utils.toTrytes(JSON.stringify(messageToSend));
            console.log("Converted Message into trytes: ", messageTrytes);
            // We display the loading screen
            $("#send__waiting").css("display", "block");
            $("#submit").toggleClass("disabled");
            // If there was any previous error message, we remove it
            $("#send__success").html();

            // call send transfer
            sendTransfer(address, value, messageTrytes);

        } catch (e) {

            console.log(e);
            var html = '<div class="alert alert-warning alert-dismissible" role="alert"><button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button><strong>Wrong Format!</strong> Your message contains an illegal character. Make sure you only enter valid ASCII characters.</div>'
            $("#send__success").html(html);

        }
    })
});
