// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Counter} from "../src/Counter.sol";

contract CounterTest {
    Counter private counter;

    function setUp() public {
        counter = new Counter();
    }

    function testIncrement() public {
        counter.increment();
        require(counter.number() == 1, "increment failed");
    }

    function testFuzzSetNumber(uint256 value) public {
        counter.setNumber(value);
        require(counter.number() == value, "setNumber failed");
    }
}
